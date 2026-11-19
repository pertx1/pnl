import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { humanAgentEnabled, InboxError } from "./config";
import { isValidEmail } from "./mime";
import { gmailSendReply } from "./providers/gmail";
import { igSendReply } from "./providers/instagram";
import { outlookSendReply } from "./providers/outlook";
import { insertMessages, loadConnection } from "./sync";
import { freshAccessToken } from "./tokens";
import { fitsInstagram, messagingWindow } from "./window";

/** Máximo de respuestas por conexión y hora (freno anti-abuso: Kreo no es una herramienta de envíos masivos). */
export const MAX_REPLIES_PER_HOUR = 30;

/**
 * Envía UNA respuesta en un hilo EXISTENTE, tras el clic humano en "Enviar".
 * - Destinatario derivado del propio hilo (no editable): imposible escribir en frío a terceros.
 * - Instagram: respeta la ventana de 24 h (o HUMAN_AGENT 7 días si Meta lo aprobó).
 * Llamar solo después de comprobar con la sesión del usuario que es editor del workspace.
 */
export async function sendReply(o: { threadId: string; body: string; userId: string; aiAssisted: boolean }) {
  const db = createAdminClient();
  if (!db) throw new InboxError("not_configured");
  const { data: th } = await db
    .from("inbox_threads")
    .select("id, workspace_id, connection_id, external_thread_id, subject, counterpart_handle, last_inbound_at, metadata")
    .eq("id", o.threadId)
    .maybeSingle();
  if (!th) throw new InboxError("not_found");
  const conn = await loadConnection(th.connection_id);
  if (!conn || conn.status !== "active") throw new InboxError("connection_inactive");

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db
    .from("inbox_messages")
    .select("id, inbox_threads!inner(connection_id)", { count: "exact", head: true })
    .eq("inbox_threads.connection_id", conn.id)
    .eq("direction", "out")
    .not("sent_by", "is", null)
    .gte("created_at", hourAgo);
  if ((count ?? 0) >= MAX_REPLIES_PER_HOUR) throw new InboxError("rate_limited");

  // Último mensaje recibido: solo se responde a conversaciones que la otra persona ha iniciado o en las que ha escrito.
  const { data: lastIn } = await db
    .from("inbox_messages")
    .select("external_message_id, metadata")
    .eq("thread_id", th.id)
    .eq("direction", "in")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!th.last_inbound_at) throw new InboxError("no_inbound");

  const token = await freshAccessToken(conn);
  let externalId: string;

  if (conn.channel === "instagram") {
    const win = messagingWindow(th.last_inbound_at, new Date(), humanAgentEnabled());
    if (!win.canSend) throw new InboxError("window_closed");
    if (!fitsInstagram(o.body)) throw new InboxError("too_long");
    const igsid = String((th.metadata as { igsid?: string } | null)?.igsid ?? th.external_thread_id.replace(/^ig:/, ""));
    ({ externalId } = await igSendReply(token, { igsid, text: o.body, humanAgent: win.mode === "human_agent" }));
  } else if (conn.channel === "gmail") {
    if (!isValidEmail(th.counterpart_handle)) throw new InboxError("no_recipient");
    const meta = (lastIn?.metadata ?? {}) as { messageId?: string | null; references?: string | null };
    ({ externalId } = await gmailSendReply(token, {
      threadId: th.external_thread_id,
      to: th.counterpart_handle,
      subject: th.subject,
      inReplyTo: meta.messageId ?? null,
      references: meta.references ?? null,
      body: o.body,
    }));
  } else {
    if (!lastIn) throw new InboxError("no_inbound");
    await outlookSendReply(token, { messageId: lastIn.external_message_id, body: o.body });
    externalId = `kreo:${crypto.randomUUID()}`; // Graph no devuelve id; la sincronización traerá el real de Enviados
  }

  const now = new Date();
  await insertMessages(th.workspace_id, th.id, [{ externalId, direction: "out", senderName: null, body: o.body, sentAt: now }], {
    sentBy: o.userId,
    aiAssisted: o.aiAssisted,
  });
  await db.from("inbox_threads").update({ needs_reply: false, replied_at: now.toISOString(), last_message_at: now.toISOString(), unread: false, status: "open" }).eq("id", th.id);
  await db.from("inbox_drafts").delete().eq("thread_id", th.id);
  return { ok: true as const };
}
