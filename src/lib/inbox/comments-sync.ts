import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { COMMENTS_PER_MEDIA, commentExpiresAt, repliedTopLevel, type IgCommentChange, type SyncedComment } from "./comments";
import { InboxError } from "./config";
import { commentsEnabled } from "./meta-scopes";
import { igListMediaComments, igListRecentMedia } from "./providers/instagram";

/**
 * Sincronización de comentarios de Instagram (Unified Login). Guarda el MÍNIMO (ver la migración
 * 20261126110000_inbox_comments.sql): @usuario, texto y fecha, 30 días. Lectura moderada para respetar los límites de
 * la API: 1 llamada para las 25 últimas publicaciones y 1 por publicación SOLO si su número de comentarios cambió.
 * Logs sin contenido: solo códigos.
 */
type Conn = { id: string; workspace_id: string; project_id: string; external_id: string; metadata: Json };

function admin() {
  const a = createAdminClient();
  if (!a) throw new InboxError("not_configured");
  return a;
}

export async function syncComments(conn: Conn, token: string): Promise<number> {
  const db = admin();
  const media = await igListRecentMedia(conn.external_id, token);
  if (!media.length) return 0;
  const { data: known } = await db
    .from("inbox_comment_media")
    .select("id, external_media_id, comments_synced_count")
    .eq("connection_id", conn.id)
    .in("external_media_id", media.map((m) => m.externalId));
  const byExt = new Map((known ?? []).map((k) => [k.external_media_id, k]));

  let stored = 0;
  for (const m of media) {
    const { data: row } = await db
      .from("inbox_comment_media")
      .upsert(
        {
          workspace_id: conn.workspace_id,
          project_id: conn.project_id,
          connection_id: conn.id,
          external_media_id: m.externalId,
          media_type: m.mediaType,
          product_type: m.productType,
          caption_snippet: m.captionSnippet,
          permalink: m.permalink,
          thumbnail_url: m.thumbnailUrl, // URL temporal del CDN: se renueva en cada sincronización
          posted_at: m.postedAt?.toISOString() ?? null,
          comments_count: m.commentsCount,
        },
        { onConflict: "connection_id,external_media_id" },
      )
      .select("id")
      .single();
    if (!row) continue;
    const prev = byExt.get(m.externalId);
    if (prev && prev.comments_synced_count === m.commentsCount) continue; // sin cambios: no se llama a la API
    const comments = await igListMediaComments(m.externalId, token, conn.external_id);
    stored += await storeComments(conn, row.id, comments, { complete: comments.filter((c) => !c.parentExternalId).length < COMMENTS_PER_MEDIA });
    await db.from("inbox_comment_media").update({ comments_synced_count: m.commentsCount }).eq("id", row.id);
  }
  return stored;
}

/**
 * Guarda comentarios de una publicación. Nuevos de terceros → sin leer; propios → leídos. En los ya guardados solo se
 * actualizan texto y estado oculto (nunca `unread`, que es de la persona). Si la lectura es completa, se borran de Kreo
 * los que ya no existen en Instagram (minimización).
 */
export async function storeComments(conn: Conn, mediaRowId: string, comments: SyncedComment[], opts: { complete: boolean; insertOnly?: boolean }): Promise<number> {
  const db = admin();
  const now = new Date();
  const base = (c: SyncedComment) => ({
    workspace_id: conn.workspace_id,
    project_id: conn.project_id,
    connection_id: conn.id,
    media_id: mediaRowId,
    external_comment_id: c.externalId,
    parent_external_id: c.parentExternalId,
    author_username: c.username,
    is_own: c.isOwn,
    body_text: c.body,
    commented_at: c.commentedAt.toISOString(),
    hidden: c.hidden,
    expires_at: commentExpiresAt(c.commentedAt, now).toISOString(),
  });
  // Lotes homogéneos: si una fila no lleva `unread`, la base de datos pone su valor por defecto (true) solo al insertar.
  const own = comments.filter((c) => c.isOwn).map((c) => ({ ...base(c), unread: false }));
  const others = comments.filter((c) => !c.isOwn).map(base);
  // insertOnly (webhook): un reenvío de Meta no debe deshacer un «ocultar» hecho después.
  const up = { onConflict: "connection_id,external_comment_id", ignoreDuplicates: Boolean(opts.insertOnly) };
  if (own.length) await db.from("inbox_comments").upsert(own, up);
  if (others.length) await db.from("inbox_comments").upsert(others, up);

  // Hilos ya respondidos por la cuenta (en Kreo o en la app de Instagram).
  for (const [topId, at] of repliedTopLevel(comments)) {
    await db.from("inbox_comments").update({ replied_at: at.toISOString() }).eq("connection_id", conn.id).eq("external_comment_id", topId).is("replied_at", null);
  }

  if (opts.complete) {
    const keep = new Set(comments.map((c) => c.externalId));
    const { data: existing } = await db.from("inbox_comments").select("id, external_comment_id, created_at").eq("media_id", mediaRowId);
    // Margen de 5 min para no borrar una respuesta recién enviada desde Kreo que la API aún no devuelve.
    const gone = (existing ?? []).filter((r) => !keep.has(r.external_comment_id) && now.getTime() - new Date(r.created_at).getTime() > 5 * 60_000).map((r) => r.id);
    if (gone.length) await db.from("inbox_comments").delete().in("id", gone);
  }

  const latest = comments.reduce<Date | null>((acc, c) => (!acc || c.commentedAt > acc ? c.commentedAt : acc), null);
  if (latest) await db.from("inbox_comment_media").update({ last_comment_at: latest.toISOString() }).eq("id", mediaRowId);
  return comments.length;
}

/**
 * Comentario recibido por webhook (campo `comments`). Se guarda en cada proyecto que tenga esa cuenta con comentarios
 * activados. Devuelve los ids de conexión cuya publicación era nueva (para completar la miniatura con una sincronización).
 */
export async function ingestIgComment(igAccountId: string, change: IgCommentChange): Promise<string[]> {
  const db = admin();
  const { data: conns } = await db
    .from("inbox_connections")
    .select("id, workspace_id, project_id, external_id, metadata")
    .eq("channel", "instagram")
    .eq("external_id", igAccountId)
    .eq("status", "active");
  const needSync: string[] = [];
  for (const conn of conns ?? []) {
    if (!commentsEnabled(conn.metadata)) continue;
    let { data: media } = await db.from("inbox_comment_media").select("id").eq("connection_id", conn.id).eq("external_media_id", change.mediaId).maybeSingle();
    if (!media) {
      ({ data: media } = await db
        .from("inbox_comment_media")
        .upsert({ workspace_id: conn.workspace_id, project_id: conn.project_id, connection_id: conn.id, external_media_id: change.mediaId }, { onConflict: "connection_id,external_media_id" })
        .select("id")
        .single());
      needSync.push(conn.id);
    }
    if (!media) continue;
    const isOwn = change.fromId === igAccountId;
    await storeComments(
      conn,
      media.id,
      [{ externalId: change.externalId, parentExternalId: change.parentExternalId, username: change.username, isOwn, body: change.text, commentedAt: new Date(), hidden: false }],
      { complete: false, insertOnly: true },
    );
  }
  return needSync;
}
