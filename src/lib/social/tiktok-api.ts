import "server-only";
import { jsonOrThrow, platformFetch } from "./http";
import { creatorBlocker, parseCreatorInfo, tiktokPostIdFromRaw, type CreatorInfo } from "./tiktok-core";
import { PlatformError, type TokenSet } from "./types";

/**
 * Llamadas OFICIALES de la Content Posting API de TikTok que comparten el worker y las acciones de servidor.
 * El access token solo se usa aquí (servidor); nunca se devuelve al navegador.
 * Docs: https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info
 *       https://developers.tiktok.com/doc/content-posting-api-reference-upload-video
 *       https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status
 */
const API = "https://open.tiktokapis.com/v2";

const json = (tokens: TokenSet) => ({ Authorization: `Bearer ${tokens.accessToken}`, "Content-Type": "application/json; charset=UTF-8" });

type TikTokEnvelope<T> = { data?: T; error?: { code?: string; message?: string; log_id?: string } };

/**
 * `creator_info/query` (scope `video.publish`, 20 peticiones/min por token). TikTok devuelve algunos bloqueos con
 * HTTP 200 y `error.code` ≠ "ok" (límite diario, usuario vetado, cupo de usuarios): se lanzan como PlatformError.
 */
export async function queryCreatorInfo(tokens: TokenSet): Promise<CreatorInfo> {
  const res = await platformFetch("tiktok", `${API}/post/publish/creator_info/query/`, { method: "POST", headers: json(tokens) });
  const body = await jsonOrThrow<TikTokEnvelope<unknown>>("tiktok", res, "creator_info_failed");
  const code = body.error?.code;
  if (code && code !== "ok") throw new PlatformError("tiktok", creatorBlocker(code) ? `creator_blocked:${code}` : `creator_info_failed:${code}`, res.status);
  return parseCreatorInfo(body.data);
}

/**
 * Envía el vídeo a la bandeja (borradores) del creador: `inbox/video/init` con FILE_UPLOAD + un único PUT.
 * Scope `video.upload`. El creador recibe una notificación en TikTok y termina la publicación allí.
 * La API de inbox no acepta título ni `is_aigc`: el texto y la etiqueta de IA los pone el creador en TikTok.
 */
export async function uploadTikTokInbox(tokens: TokenSet, video: { mime: string; bytes: () => Promise<ArrayBuffer> }): Promise<{ publishId: string }> {
  const bytes = await video.bytes();
  const size = bytes.byteLength;
  // Un único fragmento: TikTok lo admite por debajo de 64 MB (Kreo guarda vídeos de hasta 50 MB).
  if (size > 64 * 1024 * 1024) throw new PlatformError("tiktok", "video_too_large");
  const init = await platformFetch("tiktok", `${API}/post/publish/inbox/video/init/`, {
    method: "POST",
    headers: json(tokens),
    body: JSON.stringify({ source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: size, total_chunk_count: 1 } }),
  });
  const body = await jsonOrThrow<TikTokEnvelope<{ publish_id: string; upload_url: string }>>("tiktok", init, "inbox_init_failed");
  if (body.error?.code && body.error.code !== "ok") throw new PlatformError("tiktok", `inbox_init_failed:${body.error.code}`, init.status);
  if (!body.data?.publish_id || !body.data.upload_url) throw new PlatformError("tiktok", "inbox_init_failed");

  const up = await fetch(body.data.upload_url, {
    method: "PUT",
    headers: { "Content-Type": video.mime, "Content-Range": `bytes 0-${size - 1}/${size}`, "Content-Length": String(size) },
    body: bytes,
    signal: AbortSignal.timeout(120_000),
  });
  if (!up.ok) throw new PlatformError("tiktok", "upload_failed", up.status);
  return { publishId: body.data.publish_id };
}

/** `status/fetch` (scopes `video.upload` o `video.publish`, 30 peticiones/min por token). */
export async function fetchTikTokPublishStatus(tokens: TokenSet, publishId: string): Promise<{ status: string; failReason: string | null; postId: string | null }> {
  const res = await platformFetch("tiktok", `${API}/post/publish/status/fetch/`, { method: "POST", headers: json(tokens), body: JSON.stringify({ publish_id: publishId }) });
  // El id del vídeo es un int64: se lee del texto crudo para no perder precisión al pasarlo a número de JS.
  const raw = await res.clone().text().catch(() => "");
  const body = await jsonOrThrow<TikTokEnvelope<{ status?: string; fail_reason?: string }>>("tiktok", res, "status_failed");
  if (body.error?.code && body.error.code !== "ok") throw new PlatformError("tiktok", `status_failed:${body.error.code}`, res.status);
  return { status: body.data?.status ?? "", failReason: body.data?.fail_reason ?? null, postId: tiktokPostIdFromRaw(raw) };
}
