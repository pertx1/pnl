import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { commentExpiresAt, MAX_COMMENT_REPLIES_PER_HOUR, replyTarget, validCommentReply } from "./comments";
import { InboxError } from "./config";
import { commentsEnabled } from "./meta-scopes";
import { igHideComment, igReplyToComment } from "./providers/instagram";
import { loadConnection } from "./sync";
import { freshAccessToken } from "./tokens";

function admin() {
  const a = createAdminClient();
  if (!a) throw new InboxError("not_configured");
  return a;
}

async function loadComment(commentId: string) {
  const { data: c } = await admin()
    .from("inbox_comments")
    .select("id, workspace_id, project_id, connection_id, media_id, external_comment_id, parent_external_id, is_own, hidden")
    .eq("id", commentId)
    .maybeSingle();
  if (!c) throw new InboxError("not_found");
  const conn = await loadConnection(c.connection_id);
  if (!conn || conn.status !== "active") throw new InboxError("connection_inactive");
  if (!commentsEnabled(conn.metadata)) throw new InboxError("comments_not_enabled");
  return { c, conn };
}

/**
 * Responde UN comentario en su hilo, tras el clic humano en «Responder». Un intento; destino derivado del propio
 * comentario (no editable). Máx. 30 respuestas por conexión y hora. Llamar SOLO tras comprobar el rol editor con la
 * sesión del usuario.
 */
export async function replyToComment(o: { commentId: string; body: string; userId: string; aiAssisted: boolean }) {
  const text = o.body.trim();
  if (!validCommentReply(text)) throw new InboxError("too_long");
  const { c, conn } = await loadComment(o.commentId);
  const target = replyTarget({ externalId: c.external_comment_id, parentExternalId: c.parent_external_id, isOwn: c.is_own, hidden: c.hidden });
  if (!target.ok) throw new InboxError(target.reason === "hidden" ? "comment_hidden" : "comment_own");

  const db = admin();
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("inbox_comments").select("id", { count: "exact", head: true }).eq("connection_id", conn.id).not("sent_by", "is", null).gte("created_at", hourAgo);
  if ((count ?? 0) >= MAX_COMMENT_REPLIES_PER_HOUR) throw new InboxError("rate_limited");

  const token = await freshAccessToken(conn);
  const { externalId } = await igReplyToComment(target.targetId, token, text);
  const now = new Date();
  await db.from("inbox_comments").upsert(
    {
      workspace_id: c.workspace_id,
      project_id: c.project_id,
      connection_id: c.connection_id,
      media_id: c.media_id,
      external_comment_id: externalId,
      parent_external_id: target.targetId,
      author_username: null,
      is_own: true,
      body_text: text,
      commented_at: now.toISOString(),
      unread: false,
      sent_by: o.userId,
      ai_assisted: o.aiAssisted,
      expires_at: commentExpiresAt(now, now).toISOString(),
    },
    { onConflict: "connection_id,external_comment_id", ignoreDuplicates: true },
  );
  await db.from("inbox_comments").update({ replied_at: now.toISOString(), unread: false }).eq("connection_id", c.connection_id).eq("external_comment_id", target.targetId);
  if (target.targetId !== c.external_comment_id) await db.from("inbox_comments").update({ unread: false }).eq("id", c.id);
  await db.from("inbox_comment_media").update({ last_comment_at: now.toISOString() }).eq("id", c.media_id);
  return { ok: true as const };
}

/** Oculta o vuelve a mostrar un comentario en Instagram (y en Kreo). Tras el clic humano. */
export async function setCommentHidden(o: { commentId: string; hide: boolean }) {
  const { c, conn } = await loadComment(o.commentId);
  if (c.is_own) throw new InboxError("comment_own"); // Instagram siempre muestra los comentarios del dueño
  const token = await freshAccessToken(conn);
  await igHideComment(c.external_comment_id, token, o.hide);
  await admin().from("inbox_comments").update({ hidden: o.hide, unread: false }).eq("id", c.id);
  return { ok: true as const };
}
