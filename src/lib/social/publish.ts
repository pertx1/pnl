import "server-only";
import type { PlatformOptions } from "@/lib/posts/rules";
import { jsonOrThrow, platformFetch } from "./http";
import { igGraph } from "./instagram-login";
import { fetchTikTokPublishStatus, queryCreatorInfo, uploadTikTokInbox } from "./tiktok-api";
import { directFallsBackToInbox, inboxFallsBackToManual, manualReason, platformCode, type TikTokHandoff, type TikTokMode } from "./tiktok-core";
import { PlatformError, type Platform, type TokenSet } from "./types";
import { buildYouTubeVideoResource, youtubeInsertUrl } from "./youtube-upload-core";

/**
 * Publicación con las APIs OFICIALES. Solo la invoca el worker para posts APROBADOS por un humano.
 * Etiqueta IA: se usa el campo nativo cuando la API lo ofrece (TikTok `is_aigc`, YouTube `containsSyntheticMedia`).
 * Instagram no expone campo de etiqueta IA en la API → se añade una divulgación al final del texto.
 */
export type PublishMedia = { url: string; mime: string; bytes?: () => Promise<ArrayBuffer> };
export type PublishInput = {
  externalId: string;
  caption: string;
  media: PublishMedia[];
  aiGenerated: boolean;
  options: PlatformOptions;
  aiDisclosure: string; // texto de divulgación para redes sin etiqueta nativa
  /** Miniatura personalizada de YouTube (ya validada como imagen del mismo proyecto). */
  thumbnail?: PublishMedia;
  /** Subtítulos .srt para YouTube (captions.insert). Ver la convención en src/lib/social/captions.ts. */
  captions?: { srt: string; language: string; draft?: boolean };
  /** Instagram: la cuenta se conectó con Instagram Login → graph.instagram.com (si no, Facebook Login → graph.facebook.com). */
  instagramLogin?: boolean;
};
/** `warnings`: pasos opcionales que fallaron sin impedir la publicación (p. ej. la miniatura). */
export type PublishResult = { externalPostId: string; url?: string; warnings?: string[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------- Instagram (Content Publishing API)
async function publishInstagram(tokens: TokenSet, input: PublishInput): Promise<PublishResult> {
  // Mismos endpoints (/media, /media_publish, ?fields=status_code) en los dos hosts oficiales.
  // Instagram Login: graph.instagram.com con el token en la cabecera Authorization (nunca en la URL).
  const igLogin = Boolean(input.instagramLogin);
  const graph = igLogin ? igGraph() : `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v27.0"}`;
  const authQuery = igLogin ? "" : `access_token=${encodeURIComponent(tokens.accessToken)}`;
  const headers: Record<string, string> = igLogin ? { Authorization: `Bearer ${tokens.accessToken}` } : {};
  const withAuth = (path: string) => `${graph}${path}${authQuery ? `${path.includes("?") ? "&" : "?"}${authQuery}` : ""}`;
  const caption = input.aiGenerated ? `${input.caption}\n\n${input.aiDisclosure}` : input.caption;

  async function container(media: PublishMedia, carouselItem: boolean) {
    const isVideo = media.mime.startsWith("video/");
    const body = new URLSearchParams({
      ...(isVideo ? { media_type: carouselItem ? "VIDEO" : "REELS", video_url: media.url } : { image_url: media.url }),
      ...(carouselItem ? { is_carousel_item: "true" } : { caption }),
      // Reel de prueba: solo con un único vídeo (REELS). Valores oficiales: MANUAL | SS_PERFORMANCE.
      ...(isVideo && !carouselItem && input.options.ig_trial_reel
        ? { trial_params: JSON.stringify({ graduation_strategy: input.options.ig_trial_reel === "auto" ? "SS_PERFORMANCE" : "MANUAL" }) }
        : {}),
    });
    const res = await platformFetch("instagram", withAuth(`/${input.externalId}/media`), { method: "POST", body, headers });
    return (await jsonOrThrow<{ id: string }>("instagram", res, "container_failed")).id;
  }

  async function waitReady(id: string) {
    for (let i = 0; i < 30; i++) {
      const res = await platformFetch("instagram", withAuth(`/${id}?fields=status_code`), { headers });
      const { status_code } = await jsonOrThrow<{ status_code?: string }>("instagram", res, "status_failed");
      if (!status_code || status_code === "FINISHED") return;
      if (status_code === "ERROR" || status_code === "EXPIRED") throw new PlatformError("instagram", "media_processing_failed");
      await sleep(5000);
    }
    throw new PlatformError("instagram", "media_processing_timeout");
  }

  let creationId: string;
  if (input.media.length > 1) {
    const children = [];
    for (const m of input.media.slice(0, 10)) {
      const id = await container(m, true);
      await waitReady(id);
      children.push(id);
    }
    const body = new URLSearchParams({ media_type: "CAROUSEL", children: children.join(","), caption });
    const res = await platformFetch("instagram", withAuth(`/${input.externalId}/media`), { method: "POST", body, headers });
    creationId = (await jsonOrThrow<{ id: string }>("instagram", res, "container_failed")).id;
  } else {
    creationId = await container(input.media[0], false);
  }
  await waitReady(creationId);

  const res = await platformFetch("instagram", withAuth(`/${input.externalId}/media_publish`), {
    method: "POST",
    headers,
    body: new URLSearchParams({ creation_id: creationId }),
  });
  const { id } = await jsonOrThrow<{ id: string }>("instagram", res, "publish_failed");
  return { externalPostId: id };
}

// ------------------------------------------------------------------- TikTok (Content Posting API · Direct Post)
async function publishTikTok(tokens: TokenSet, input: PublishInput): Promise<PublishResult> {
  const API = "https://open.tiktokapis.com/v2";
  const headers = { Authorization: `Bearer ${tokens.accessToken}`, "Content-Type": "application/json; charset=UTF-8" };
  const video = input.media.find((m) => m.mime.startsWith("video/"));
  if (!video?.bytes) throw new PlatformError("tiktok", "unsupported_media"); // fotos: requieren dominio verificado (PULL_FROM_URL)

  // 1) Consultar las opciones del creador justo antes de publicar (obligatorio según las guías de TikTok).
  const info = await queryCreatorInfo(tokens);
  if (!input.options.privacy_level || !info.privacyOptions.includes(input.options.privacy_level)) {
    throw new PlatformError("tiktok", "privacy_not_allowed");
  }

  // 2) Iniciar la subida (FILE_UPLOAD) con la etiqueta de contenido IA nativa.
  const bytes = await video.bytes();
  const size = bytes.byteLength;
  const initRes = await platformFetch("tiktok", `${API}/post/publish/video/init/`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      post_info: {
        title: input.caption.slice(0, 2200),
        privacy_level: input.options.privacy_level,
        // Interacciones desactivadas salvo que el usuario las active expresamente (`disable_* === false`).
        disable_comment: input.options.disable_comment !== false || info.commentDisabled,
        disable_duet: input.options.disable_duet !== false || info.duetDisabled,
        disable_stitch: input.options.disable_stitch !== false || info.stitchDisabled,
        brand_content_toggle: Boolean(input.options.brand_content_toggle),
        brand_organic_toggle: Boolean(input.options.brand_organic_toggle),
        is_aigc: input.aiGenerated,
      },
      source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: size, total_chunk_count: 1 },
    }),
  });
  const init = await jsonOrThrow<{ data: { publish_id: string; upload_url: string } }>("tiktok", initRes, "init_failed");

  // 3) Subir el vídeo en un único fragmento (≤ 50 MB).
  const up = await fetch(init.data.upload_url, {
    method: "PUT",
    headers: { "Content-Type": video.mime, "Content-Range": `bytes 0-${size - 1}/${size}`, "Content-Length": String(size) },
    body: bytes,
  });
  if (!up.ok) throw new PlatformError("tiktok", "upload_failed", up.status);

  // 4) Consultar el estado hasta que termine.
  for (let i = 0; i < 40; i++) {
    await sleep(5000);
    const s = await fetchTikTokPublishStatus(tokens, init.data.publish_id);
    if (s.status === "PUBLISH_COMPLETE") return { externalPostId: s.postId ?? init.data.publish_id };
    if (s.status === "FAILED") throw new PlatformError("tiktok", s.failReason ?? "publish_failed");
  }
  throw new PlatformError("tiktok", "publish_timeout");
}

/**
 * Entrega a TikTok según el modo, sin dejar nunca el destino «fallido» por la falta de auditoría:
 * 1. "direct": Direct Post. Si TikTok lo rechaza por cliente sin auditar (cuenta pública, cupo…) → paso 2.
 * 2. "inbox": sube el vídeo a los borradores del creador (scope video.upload); él lo publica en la app de TikTok.
 *    Si no se puede (sin scope, 5 pendientes en 24 h, sin vídeo…) → paso 3. Los errores transitorios se reintentan.
 * 3. "manual": no se llama a ninguna API; Kreo prepara el vídeo y el texto para que el creador lo suba a mano.
 */
export type TikTokDelivery = { kind: "published"; result: PublishResult } | { kind: "handoff"; handoff: TikTokHandoff; publishId: string | null };

export async function deliverTikTok(tokens: TokenSet, input: PublishInput, mode: TikTokMode): Promise<TikTokDelivery> {
  if (mode === "direct") {
    try {
      return { kind: "published", result: await publishTikTok(tokens, input) };
    } catch (e) {
      if (!(e instanceof PlatformError) || !directFallsBackToInbox(e.code)) throw e;
      console.warn(`[publish] tiktok direct → inbox: ${platformCode(e.code).slice(0, 80)}`);
    }
  }
  const video = input.media.find((m) => m.mime.startsWith("video/"));
  if (!video?.bytes) return { kind: "handoff", handoff: { mode: "manual", reason: "video_required" }, publishId: null };
  try {
    const { publishId } = await uploadTikTokInbox(tokens, { mime: video.mime, bytes: video.bytes });
    return { kind: "handoff", handoff: { mode: "inbox", reason: null }, publishId };
  } catch (e) {
    if (!(e instanceof PlatformError) || !inboxFallsBackToManual(e.code)) throw e;
    console.warn(`[publish] tiktok inbox → manual: ${platformCode(e.code).slice(0, 80)}`);
    return { kind: "handoff", handoff: { mode: "manual", reason: manualReason(e.code) }, publishId: null };
  }
}

// ------------------------------------------------------------------- YouTube (Data API v3 · subida reanudable)
async function publishYouTube(tokens: TokenSet, input: PublishInput): Promise<PublishResult> {
  const video = input.media.find((m) => m.mime.startsWith("video/"));
  if (!video?.bytes) throw new PlatformError("youtube", "video_required");
  const bytes = await video.bytes();
  const o = input.options;
  const auth = { Authorization: `Bearer ${tokens.accessToken}` };

  const start = await platformFetch("youtube", youtubeInsertUrl(o), {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": video.mime, "X-Upload-Content-Length": String(bytes.byteLength) },
    // Metadatos (título, etiquetas, privacidad, `containsSyntheticMedia`…): mismo cuerpo que la subida directa.
    body: JSON.stringify(buildYouTubeVideoResource({ options: o, caption: input.caption, aiGenerated: input.aiGenerated })),
  });
  const location = start.headers.get("location");
  if (!start.ok || !location) throw new PlatformError("youtube", "upload_init_failed", start.status);

  const put = await fetch(location, { method: "PUT", headers: { "Content-Type": video.mime }, body: bytes });
  const json = await jsonOrThrow<{ id: string }>("youtube", put, "upload_failed");
  const warnings = await applyYouTubeExtras(tokens, json.id, { options: o, thumbnail: input.thumbnail, captions: input.captions });
  return { externalPostId: json.id, url: `https://www.youtube.com/watch?v=${json.id}`, warnings };
}

/**
 * Pasos opcionales tras subir un vídeo a YouTube (miniatura, lista de reproducción…). Los usan el worker y la
 * subida directa. Si fallan, el vídeo ya está subido: se devuelven avisos y NO se reintenta la subida.
 */
export async function applyYouTubeExtras(
  tokens: TokenSet,
  videoId: string,
  input: { options: PlatformOptions; thumbnail?: PublishMedia; captions?: { srt: string; language: string; draft?: boolean } },
): Promise<string[]> {
  const o = input.options;
  const auth = { Authorization: `Bearer ${tokens.accessToken}` };
  const json = { id: videoId };
  const warnings: string[] = [];

  if (input.thumbnail?.bytes) {
    try {
      const img = await input.thumbnail.bytes();
      if (img.byteLength > 2 * 1024 * 1024) throw new Error("too_big");
      const th = await platformFetch("youtube", `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(json.id)}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": input.thumbnail.mime },
        body: img,
      });
      // 403 típico: el canal no está verificado para miniaturas personalizadas.
      if (!th.ok) warnings.push(`thumbnail_${th.status}`);
    } catch (e) {
      warnings.push(`thumbnail_${(e as Error).message === "too_big" ? "too_big" : "failed"}`);
    }
  }
  if (o.yt_playlist_id) {
    const pl = await platformFetch("youtube", "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ snippet: { playlistId: o.yt_playlist_id, resourceId: { kind: "youtube#video", videoId: json.id } } }),
    }).catch(() => null);
    // 403 típico: la conexión es anterior al permiso de listas → reconectar YouTube.
    if (!pl?.ok) warnings.push(`playlist_${pl?.status ?? "failed"}`);
  }
  if (input.captions?.srt) {
    // captions.insert (scope youtube.force-ssl; 400 unidades de cuota). Sin reintentos: un POST repetido duplicaría la pista.
    // isDraft: transcripciones automáticas que nadie ha revisado quedan como borrador en YouTube Studio (ver captions.ts).
    try {
      const boundary = `kreo${crypto.randomUUID().replace(/-/g, "")}`;
      const meta = JSON.stringify({ snippet: { videoId: json.id, language: input.captions.language, name: "", isDraft: Boolean(input.captions.draft) } });
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
        `--${boundary}\r\nContent-Type: application/x-subrip; charset=UTF-8\r\n\r\n${input.captions.srt}\r\n--${boundary}--\r\n`;
      const cap = await fetch("https://www.googleapis.com/upload/youtube/v3/captions?part=snippet&uploadType=multipart", {
        method: "POST",
        headers: { ...auth, "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });
      // 403 típico: la conexión es anterior al permiso youtube.force-ssl → reconectar YouTube.
      if (!cap.ok) warnings.push(`captions_${cap.status}`);
    } catch {
      warnings.push("captions_failed");
    }
  }
  return warnings;
}

/** Listas de reproducción del canal conectado (solo lectura). */
export async function listYouTubePlaylists(tokens: TokenSet): Promise<{ id: string; title: string }[]> {
  const res = await platformFetch("youtube", "https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50", {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  });
  const json = await jsonOrThrow<{ items?: { id: string; snippet?: { title?: string } }[] }>("youtube", res, "playlists_failed");
  return (json.items ?? []).map((p) => ({ id: p.id, title: p.snippet?.title ?? p.id }));
}

export async function publishTo(platform: Platform, tokens: TokenSet, input: PublishInput): Promise<PublishResult> {
  if (platform === "instagram") return publishInstagram(tokens, input);
  if (platform === "tiktok") return publishTikTok(tokens, input);
  return publishYouTube(tokens, input);
}
