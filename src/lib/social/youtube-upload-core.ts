/**
 * Subida directa navegador → YouTube (YouTube Data API v3, protocolo de subida reanudable).
 * Lógica PURA compartida por servidor y navegador: sin red, sin tokens, sin "server-only".
 *
 * Documentación oficial verificada (2026-11-23):
 * - https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
 *   «The chunk size must be a multiple of 256 KB» · 308 «Resume Incomplete» + cabecera `Range`
 *   · consulta de estado con `Content-Range: bytes *\/CONTENT_LENGTH` · 404 = sesión caducada.
 * - https://developers.google.com/youtube/v3/docs/videos#status.publishAt
 *   «can only be set if the video's privacy status is private and the video has never been published».
 */
import type { PlatformOptions } from "@/lib/posts/rules";

/** Supabase Storage (plan gratis) no admite archivos de más de 50 MB. */
export const STORAGE_MAX_BYTES = 50 * 1024 * 1024;
/** Límite de YouTube: 256 GB o 12 h (lo que llegue antes). */
export const YT_MAX_BYTES = 256 * 1024 * 1024 * 1024;
/** Unidad de troceado obligatoria del protocolo reanudable. */
export const CHUNK_UNIT = 256 * 1024;
/** 16 MB por trozo (64 × 256 KB): equilibrio entre progreso fino y nº de peticiones. */
export const DEFAULT_CHUNK = 64 * CHUNK_UNIT;

export type YtDirectUpload = NonNullable<PlatformOptions["yt_direct_upload"]>;

/** Trozo a enviar a partir de `offset`. `end` es inclusivo (como en Content-Range). */
export function nextChunk(offset: number, size: number, chunk = DEFAULT_CHUNK) {
  if (!Number.isInteger(size) || size <= 0) throw new Error("invalid_size");
  if (!Number.isInteger(chunk) || chunk <= 0 || chunk % CHUNK_UNIT !== 0) throw new Error("chunk_not_multiple_of_256k");
  if (!Number.isInteger(offset) || offset < 0 || offset >= size) throw new Error("invalid_offset");
  const end = Math.min(offset + chunk, size) - 1;
  return { start: offset, end, length: end - offset + 1, contentRange: `bytes ${offset}-${end}/${size}` };
}

/** Lista completa de trozos (para tests y para estimar peticiones). */
export function planChunks(size: number, chunk = DEFAULT_CHUNK) {
  const out: ReturnType<typeof nextChunk>[] = [];
  for (let o = 0; o < size; ) {
    const c = nextChunk(o, size, chunk);
    out.push(c);
    o = c.end + 1;
  }
  return out;
}

/** Cabecera para preguntar cuánto ha recibido YouTube tras un corte. */
export const statusQueryRange = (size: number) => `bytes */${size}`;

/**
 * Siguiente byte a enviar según la cabecera `Range` de un 308 («bytes=0-42» → 43).
 * Sin cabecera = YouTube no ha recibido nada todavía (según la guía oficial) → 0.
 */
export function offsetFromRange(range: string | null | undefined): number {
  if (!range) return 0;
  const m = /^\s*bytes=0-(\d+)\s*$/i.exec(range);
  if (!m) throw new Error("invalid_range_header");
  return Number(m[1]) + 1;
}

export type UploadStep = "done" | "incomplete" | "retry" | "expired" | "fatal";
/** Qué hacer según el código HTTP de un PUT de trozo o de una consulta de estado. */
export function classifyUploadStatus(status: number): UploadStep {
  if (status === 200 || status === 201) return "done";
  if (status === 308) return "incomplete";
  if (status === 404 || status === 410) return "expired"; // sesión caducada: hay que empezar de cero
  if (status === 0 || status === 408 || status === 429 || status >= 500) return "retry"; // 0 = red caída / CORS
  return "fatal";
}

/** Espera con backoff exponencial (la guía pide backoff para 500/502/503/504). Máx. 32 s. */
export const backoffMs = (attempt: number) => Math.min(32_000, 1000 * 2 ** attempt);

/**
 * `publishAt` solo si el usuario quiere el vídeo PÚBLICO y la fecha es futura: YouTube lo sube privado y lo hace
 * público a esa hora. Con privacidad "unlisted" o "private" no hay programación nativa posible (publishAt siempre
 * acaba en público) → se sube ya con esa privacidad.
 */
export function resolvePublishAt(scheduledAt: string | null | undefined, privacy: PlatformOptions["yt_privacy"], now = Date.now()): string | null {
  if (!scheduledAt || privacy !== "public") return null;
  const t = new Date(scheduledAt).getTime();
  if (!Number.isFinite(t) || t <= now + 60_000) return null; // en el pasado o inminente: YouTube lo publicaría ya
  return new Date(t).toISOString();
}

/** Cuerpo de metadatos de videos.insert (part=snippet,status). Mismo criterio que el worker. */
export function buildYouTubeVideoResource(input: { options: PlatformOptions; caption: string; aiGenerated: boolean; publishAt?: string | null }) {
  const o = input.options;
  const tags = (o.yt_tags ?? []).map((t) => t.trim()).filter(Boolean);
  return {
    snippet: {
      title: (o.yt_title ?? "").slice(0, 100),
      description: input.caption.slice(0, 5000),
      ...(tags.length ? { tags } : {}),
      categoryId: o.yt_category_id ?? "22",
      ...(o.yt_language ? { defaultLanguage: o.yt_language, defaultAudioLanguage: o.yt_language } : {}),
    },
    status: {
      // publishAt exige privacyStatus "private" (YouTube lo hace público a la hora indicada).
      privacyStatus: input.publishAt ? "private" : (o.yt_privacy ?? "private"),
      ...(input.publishAt ? { publishAt: input.publishAt } : {}),
      selfDeclaredMadeForKids: Boolean(o.yt_made_for_kids),
      containsSyntheticMedia: input.aiGenerated, // divulgación de contenido alterado o sintético
      embeddable: o.yt_embeddable !== false,
      license: o.yt_license ?? "youtube",
    },
  };
}

/** URL de inicio de la sesión reanudable de videos.insert. */
export function youtubeInsertUrl(options: PlatformOptions) {
  const notify = options.yt_notify_subscribers === false ? "false" : "true";
  return `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=${notify}`;
}

/** Traduce un error de la Data API (`error.errors[0].reason`) a una clave de mensaje. */
export function youtubeErrorKey(status: number, body: unknown): string {
  const reason =
    (body as { error?: { errors?: { reason?: string }[] } } | null)?.error?.errors?.[0]?.reason ??
    (body as { error?: { status?: string } } | null)?.error?.status;
  if (status === 401) return "reconnect";
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded" || reason === "rateLimitExceeded" || status === 429) return "quota";
  if (reason === "uploadLimitExceeded") return "upload_limit";
  if (reason === "invalidPublishAt") return "invalid_publish_at";
  if (reason === "invalidCategoryId" || reason === "invalidTitle" || reason === "invalidDescription" || reason === "invalidTags") return "invalid_metadata";
  if (reason === "forbidden" || reason === "insufficientPermissions" || status === 403) return "reconnect";
  return "generic";
}

/** Valida el archivo elegido en el navegador antes de nada. */
export function checkDirectFile(file: { size: number; type: string }): "ok" | "not_video" | "too_big" | "empty" {
  if (!file.size) return "empty";
  if (!file.type.startsWith("video/")) return "not_video";
  if (file.size > YT_MAX_BYTES) return "too_big";
  return "ok";
}
