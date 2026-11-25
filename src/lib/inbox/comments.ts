/**
 * Comentarios de Instagram en la Bandeja — lógica PURA (sin red, sin base de datos), testeable.
 *
 * API oficial (Instagram API with Unified Login, `graph.facebook.com`, permisos `instagram_basic` +
 * `instagram_manage_comments`):
 *  - `GET /<IG_ID>/media` (publicaciones propias) · `GET /<IG_MEDIA_ID>/comments` ("Returns a maximum of 50 comments
 *    per query", "Returns only top-level comments… unless you use field expansion to request the `replies` field").
 *  - `POST /<IG_COMMENT_ID>/replies` (message) · `POST /<IG_COMMENT_ID>?hide=true|false`.
 *  https://developers.facebook.com/documentation/instagram-platform/comment-moderation
 *  https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-comment
 *
 * Kreo NO automatiza interacción: no hay respuestas automáticas, ni «me gusta», ni seguir cuentas. Cada respuesta,
 * ocultación o cambio de estado sale de un clic humano.
 */

export const COMMENT_RETENTION_DAYS = 30;
/** Publicaciones recientes que se revisan en cada sincronización (las 25 últimas). */
export const COMMENT_MEDIA_LIMIT = 25;
/** Comentarios de primer nivel por publicación y lectura (máximo de la API). */
export const COMMENTS_PER_MEDIA = 50;
/** Longitud máxima de un comentario de Instagram. */
export const COMMENT_MAX_LENGTH = 2200;
/** Freno anti-abuso: respuestas a comentarios por conexión y hora (Kreo no es una herramienta de respuestas masivas). */
export const MAX_COMMENT_REPLIES_PER_HOUR = 30;

const DAY = 86_400_000;
const ID = /^\d{1,40}$/;

export type SyncedMedia = {
  externalId: string;
  mediaType: string | null;
  productType: string | null;
  captionSnippet: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  postedAt: Date | null;
  commentsCount: number;
};

export type SyncedComment = {
  externalId: string;
  parentExternalId: string | null;
  username: string | null;
  isOwn: boolean;
  body: string;
  commentedAt: Date;
  hidden: boolean;
};

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const httpsUrl = (v: unknown) => (typeof v === "string" && v.startsWith("https://") && v.length <= 2000 ? v : null);
const date = (v: unknown) => {
  if (typeof v !== "string") return null;
  // Graph devuelve "2017-08-31T19:16:02+0000": se normaliza el huso para Date.
  const d = new Date(v.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(d.getTime()) ? null : d;
};
const idOf = (v: unknown) => (typeof v === "string" || typeof v === "number" ? (ID.test(String(v)) ? String(v) : null) : null);

/**
 * `GET /<IG_ID>/media?fields=id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp,comments_count`.
 * Solo las que tienen comentarios. Miniatura: `thumbnail_url` en vídeos (el `media_url` de un vídeo es el MP4).
 */
export function parseMediaList(body: unknown, limit = COMMENT_MEDIA_LIMIT): SyncedMedia[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: SyncedMedia[] = [];
  for (const raw of data.slice(0, limit)) {
    const m = raw as Record<string, unknown> | null;
    const externalId = idOf(m?.id);
    if (!m || !externalId) continue;
    const count = typeof m.comments_count === "number" && m.comments_count > 0 ? Math.floor(m.comments_count) : 0;
    if (!count) continue;
    const mediaType = str(m.media_type, 40);
    const caption = str(m.caption, 2200);
    out.push({
      externalId,
      mediaType,
      productType: str(m.media_product_type, 40),
      captionSnippet: caption ? caption.replace(/\s+/g, " ").slice(0, 140) : null,
      permalink: httpsUrl(m.permalink),
      thumbnailUrl: mediaType === "VIDEO" ? httpsUrl(m.thumbnail_url) : (httpsUrl(m.thumbnail_url) ?? httpsUrl(m.media_url)),
      postedAt: date(m.timestamp),
      commentsCount: count,
    });
  }
  return out;
}

type RawComment = {
  id?: unknown;
  text?: unknown;
  timestamp?: unknown;
  username?: unknown;
  from?: { id?: unknown; username?: unknown } | null;
  user?: unknown;
  hidden?: unknown;
  replies?: { data?: unknown } | null;
};

function toComment(c: RawComment, parent: string | null, ownIgId: string): SyncedComment | null {
  const externalId = idOf(c.id);
  const at = date(c.timestamp);
  if (!externalId || !at) return null;
  const fromId = idOf(c.from?.id);
  // `user` solo se devuelve si el comentario lo escribió la propia cuenta (doc de IG Comment).
  const isOwn = Boolean(c.user) || (fromId !== null && fromId === ownIgId);
  const username = str(c.from?.username, 100) ?? str(c.username, 100);
  return {
    externalId,
    parentExternalId: parent,
    username,
    isOwn,
    body: typeof c.text === "string" ? c.text.slice(0, COMMENT_MAX_LENGTH) : "",
    commentedAt: at,
    hidden: c.hidden === true,
  };
}

/**
 * `GET /<IG_MEDIA_ID>/comments?fields=id,text,timestamp,username,from,user,hidden,replies{…}` → lista plana
 * (primer nivel + respuestas) de los últimos 30 días. Las respuestas cuelgan del comentario de primer nivel.
 */
export function flattenComments(body: unknown, ownIgId: string, now: Date = new Date()): SyncedComment[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const cutoff = now.getTime() - COMMENT_RETENTION_DAYS * DAY;
  const out: SyncedComment[] = [];
  for (const raw of data.slice(0, COMMENTS_PER_MEDIA)) {
    const top = toComment(raw as RawComment, null, ownIgId);
    if (!top) continue;
    if (top.commentedAt.getTime() >= cutoff) out.push(top);
    const replies = (raw as RawComment).replies?.data;
    if (!Array.isArray(replies)) continue;
    for (const r of replies.slice(0, COMMENTS_PER_MEDIA)) {
      const reply = toComment(r as RawComment, top.externalId, ownIgId);
      if (reply && reply.commentedAt.getTime() >= cutoff) out.push(reply);
    }
  }
  return out;
}

/** Comentarios de primer nivel a los que la cuenta ya ha respondido (hay una respuesta propia en su hilo). */
export function repliedTopLevel(comments: readonly Pick<SyncedComment, "parentExternalId" | "isOwn" | "commentedAt">[]): Map<string, Date> {
  const out = new Map<string, Date>();
  for (const c of comments) {
    if (!c.isOwn || !c.parentExternalId) continue;
    const prev = out.get(c.parentExternalId);
    if (!prev || c.commentedAt > prev) out.set(c.parentExternalId, c.commentedAt);
  }
  return out;
}

/** Caducidad de un comentario guardado: su fecha (nunca futura) + 30 días. */
export function commentExpiresAt(commentedAt: Date, now: Date = new Date()): Date {
  return new Date(Math.min(commentedAt.getTime(), now.getTime()) + COMMENT_RETENTION_DAYS * DAY);
}

/**
 * La API solo responde a comentarios de primer nivel ("replies to a reply will be added to the top-level comment") y
 * no deja responder a comentarios ocultos. Devuelve el id al que se responde o el motivo por el que no se puede.
 */
export function replyTarget(c: { externalId: string; parentExternalId: string | null; isOwn: boolean; hidden: boolean }):
  | { ok: true; targetId: string }
  | { ok: false; reason: "own" | "hidden" } {
  if (c.isOwn) return { ok: false, reason: "own" };
  if (c.hidden) return { ok: false, reason: "hidden" };
  return { ok: true, targetId: c.parentExternalId ?? c.externalId };
}

export function validCommentReply(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= COMMENT_MAX_LENGTH;
}

export type IgCommentChange = { externalId: string; parentExternalId: string | null; fromId: string | null; username: string | null; text: string; mediaId: string };

/**
 * Valor del webhook `comments` (Unified Login / Facebook Login for Business). La doc muestra el id como `comment_id`
 * en el formato de Facebook Login y como `id` en el de Instagram Login: aceptamos los dos.
 * https://developers.facebook.com/documentation/instagram-platform/webhooks/examples
 */
export function parseCommentChange(value: unknown): IgCommentChange | null {
  const v = value as { id?: unknown; comment_id?: unknown; parent_id?: unknown; text?: unknown; from?: { id?: unknown; username?: unknown } | null; media?: { id?: unknown } | null } | null;
  if (!v || typeof v !== "object") return null;
  const externalId = idOf(v.comment_id) ?? idOf(v.id);
  const mediaId = idOf(v.media?.id);
  if (!externalId || !mediaId) return null;
  return {
    externalId,
    parentExternalId: idOf(v.parent_id),
    fromId: idOf(v.from?.id),
    username: str(v.from?.username, 100),
    text: typeof v.text === "string" ? v.text.slice(0, COMMENT_MAX_LENGTH) : "",
    mediaId,
  };
}

export type CommentRow = {
  id: string;
  external_comment_id: string;
  parent_external_id: string | null;
  commented_at: string;
};

/** Agrupa en hilos (primer nivel + sus respuestas, en orden cronológico). Las respuestas huérfanas van como primer nivel. */
export function nestComments<T extends CommentRow>(rows: readonly T[]): { top: T; replies: T[] }[] {
  const sorted = [...rows].sort((a, b) => a.commented_at.localeCompare(b.commented_at));
  const tops = new Map<string, { top: T; replies: T[] }>();
  for (const r of sorted) if (!r.parent_external_id) tops.set(r.external_comment_id, { top: r, replies: [] });
  const out: { top: T; replies: T[] }[] = [];
  for (const r of sorted) {
    if (!r.parent_external_id) continue;
    const t = tops.get(r.parent_external_id);
    if (t) t.replies.push(r);
    else out.push({ top: r, replies: [] });
  }
  out.push(...tops.values());
  // Hilos más recientes primero (por la última actividad del hilo).
  const last = (g: { top: T; replies: T[] }) => (g.replies.at(-1) ?? g.top).commented_at;
  return out.sort((a, b) => last(b).localeCompare(last(a)));
}
