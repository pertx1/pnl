import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { inboxFetch } from "./http";
import { PROVIDER_READ_BATCH, providerCanMarkRead } from "./read-state";
import { freshAccessToken } from "./tokens";

/**
 * Refleja «leído» en Gmail/Outlook SOLO si la conexión ya tiene el permiso (gmail.modify / Mail.ReadWrite). Hoy Kreo
 * no pide esos permisos, así que esto no hace nada hasta que se decida pedirlos (ver read-state.ts). Nunca lanza:
 * el estado en Kreo ya está guardado y un fallo de la plataforma no debe deshacerlo. Logs solo con códigos.
 * Llamar SOLO tras comprobar con la sesión del usuario que es editor de esos hilos.
 */
export async function markReadInProvider(threadIds: string[]): Promise<void> {
  const db = createAdminClient();
  if (!db || !threadIds.length) return;
  const { data: threads } = await db
    .from("inbox_threads")
    .select("id, external_thread_id, inbox_connections!inner(id, channel, status, metadata, granted_scopes)")
    .in("id", threadIds.slice(0, PROVIDER_READ_BATCH));
  for (const th of threads ?? []) {
    const conn = th.inbox_connections;
    if (conn.status !== "active" || !providerCanMarkRead(conn.channel, conn.granted_scopes)) continue;
    try {
      const token = await freshAccessToken(conn);
      const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      if (conn.channel === "gmail") {
        // https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/modify
        await inboxFetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(th.external_thread_id)}/modify`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
        }, 1);
      } else if (conn.channel === "outlook") {
        // https://learn.microsoft.com/en-us/graph/api/message-update (isRead) — solo los mensajes recibidos guardados.
        const { data: msgs } = await db.from("inbox_messages").select("external_message_id").eq("thread_id", th.id).eq("direction", "in").limit(20);
        for (const m of msgs ?? []) {
          await inboxFetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(m.external_message_id)}`, {
            method: "PATCH",
            headers: auth,
            body: JSON.stringify({ isRead: true }),
          }, 1);
        }
      }
    } catch {
      console.error(`[inbox] marcar leído en ${conn.channel} falló`);
    }
  }
}
