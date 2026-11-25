import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { InboxError } from "./config";
import { clip } from "./mime";
import { gmailListThreads } from "./providers/gmail";
import { isInstagramLogin } from "@/lib/social/instagram-login";
import { syncComments } from "./comments-sync";
import { commentsEnabled, isUnifiedLogin } from "./meta-scopes";
import { igListThreads, igUserProfile } from "./providers/instagram";
import { igLoginListThreads, igLoginUserProfile } from "./providers/instagram-login";
import { outlookListThreads } from "./providers/outlook";
import { freshAccessToken, markExpired } from "./tokens";
import type { SyncedMessage, SyncedThread } from "./types";

/**
 * Sincronización de la bandeja: guarda el MÍNIMO.
 *  - Hilo: metadatos (asunto, contraparte, fechas, estado) + extracto corto.
 *  - Mensajes: solo los de los últimos 30 días, con `expires_at` = fecha del mensaje + 30 días (purga diaria).
 * Logs sin contenido: solo códigos de error.
 */
export const RETENTION_DAYS = 30;
const DAY = 86400000;

function admin() {
  const a = createAdminClient();
  if (!a) throw new InboxError("not_configured");
  return a;
}

type Conn = { id: string; workspace_id: string; project_id: string; channel: string; external_id: string; metadata: Json; status: string };

export async function loadConnection(connectionId: string): Promise<Conn | null> {
  const { data } = await admin().from("inbox_connections").select("id, workspace_id, project_id, channel, external_id, metadata, status").eq("id", connectionId).maybeSingle();
  return data;
}

/** Descarga los hilos recientes de una conexión y los guarda. Devuelve cuántos hilos se han actualizado. */
export async function syncConnection(connectionId: string): Promise<number> {
  const conn = await loadConnection(connectionId);
  if (!conn || conn.status !== "active") return 0;
  const db = admin();
  try {
    const token = await freshAccessToken(conn);
    let threads: SyncedThread[] = [];
    if (conn.channel === "gmail") {
      const { data: known } = await db.from("inbox_threads").select("external_thread_id, metadata").eq("connection_id", conn.id);
      const map = new Map((known ?? []).map((k) => [k.external_thread_id, String((k.metadata as { historyId?: string } | null)?.historyId ?? "")]));
      threads = await gmailListThreads(token, conn.external_id, map);
    } else if (conn.channel === "outlook") {
      threads = await outlookListThreads(token);
    } else if (isInstagramLogin(conn.metadata)) {
      threads = await igLoginListThreads(token, conn.external_id);
    } else if (isUnifiedLogin(conn.metadata)) {
      threads = await igListThreads({ igId: conn.external_id }, token, conn.external_id);
    } else {
      const pageId = String((conn.metadata as { page_id?: string } | null)?.page_id ?? "");
      if (!pageId) throw new InboxError("missing_page");
      threads = await igListThreads({ pageId }, token, conn.external_id);
    }
    for (const t of threads) await storeThread(conn, t, { emailUnread: conn.channel !== "instagram" });
    // Comentarios (solo Unified Login con instagram_manage_comments). Un fallo aquí no invalida los DMs ya guardados.
    if (commentsEnabled(conn.metadata)) {
      try {
        await syncComments(conn, token);
      } catch (e) {
        const code = e instanceof InboxError ? e.code : "unknown";
        console.error(`[inbox] sync comentarios falló: ${code}`);
        if (code === "token_expired") throw e;
      }
    }
    await db.from("inbox_connections").update({ last_synced_at: new Date().toISOString() }).eq("id", conn.id);
    return threads.length;
  } catch (e) {
    const code = e instanceof InboxError ? e.code : "unknown";
    if (code === "token_expired") await markExpired(conn.id);
    console.error(`[inbox] sync ${conn.channel} falló: ${code}`);
    throw e;
  }
}

/** Guarda/actualiza un hilo y sus mensajes recientes. */
export async function storeThread(conn: Conn, t: SyncedThread, opts: { emailUnread: boolean }) {
  const db = admin();
  const sorted = [...t.messages].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  const last = sorted.at(-1);
  if (!last) return null;
  const lastInbound = [...sorted].reverse().find((m) => m.direction === "in");
  const lastOutbound = [...sorted].reverse().find((m) => m.direction === "out");
  const cutoff = Date.now() - RETENTION_DAYS * DAY;
  const recent = sorted.filter((m) => m.sentAt.getTime() >= cutoff);

  const { data: existing } = await db
    .from("inbox_threads")
    .select("id, status, unread, last_inbound_at, subject, counterpart_name, counterpart_handle, metadata")
    .eq("connection_id", conn.id)
    .eq("external_thread_id", t.externalThreadId)
    .maybeSingle();

  const newInbound = Boolean(lastInbound && (!existing?.last_inbound_at || lastInbound.sentAt.getTime() > new Date(existing.last_inbound_at).getTime()));
  const name = t.counterpartName ?? existing?.counterpart_name ?? null;
  const handle = t.counterpartHandle ?? existing?.counterpart_handle ?? null;
  const fields = {
    subject: t.subject ?? existing?.subject ?? null,
    counterpart_name: name ? clip(name, 200) : null,
    counterpart_handle: handle ? clip(handle, 320) : null,
    snippet: last.sentAt.getTime() >= cutoff ? clip(last.body.replace(/\s+/g, " "), 140) || null : null,
    last_message_at: last.sentAt.toISOString(),
    // Nunca retrocede: un eco o un lote sin mensajes entrantes no borra la última entrada (ventana de 24 h).
    last_inbound_at: newInbound ? lastInbound!.sentAt.toISOString() : (existing?.last_inbound_at ?? lastInbound?.sentAt.toISOString() ?? null),
    needs_reply: last.direction === "in",
    replied_at: last.direction === "out" ? (lastOutbound?.sentAt.toISOString() ?? null) : null,
  };

  let threadId: string;
  if (existing) {
    threadId = existing.id;
    await db
      .from("inbox_threads")
      .update({
        ...fields,
        // Un mensaje nuevo reabre un hilo archivado y lo marca como no leído.
        status: newInbound ? "open" : existing.status,
        // Email: lo marcado como leído en Kreo se respeta hasta que llegue un mensaje nuevo (Kreo no puede quitar la
        // etiqueta UNREAD sin gmail.modify / Mail.ReadWrite); si se lee en el buzón, también queda leído en Kreo.
        unread: opts.emailUnread ? (newInbound ? t.unread : existing.unread && t.unread) : existing.unread || newInbound,
        metadata: { ...((existing.metadata as Record<string, unknown>) ?? {}), ...(t.metadata ?? {}) } as Json,
      })
      .eq("id", existing.id);
  } else {
    const { data: created, error } = await db
      .from("inbox_threads")
      .insert({
        workspace_id: conn.workspace_id,
        project_id: conn.project_id,
        connection_id: conn.id,
        external_thread_id: t.externalThreadId,
        ...fields,
        unread: opts.emailUnread ? t.unread : last.direction === "in",
        metadata: (t.metadata ?? {}) as Json,
      })
      .select("id")
      .single();
    if (error || !created) return null; // carrera con otra sincronización: la siguiente lo completa
    threadId = created.id;
  }

  if (recent.length) await insertMessages(conn.workspace_id, threadId, recent);
  return threadId;
}

export async function insertMessages(workspaceId: string, threadId: string, msgs: SyncedMessage[], extra?: { sentBy?: string; aiAssisted?: boolean }) {
  await admin()
    .from("inbox_messages")
    .upsert(
      msgs.map((m) => ({
        workspace_id: workspaceId,
        thread_id: threadId,
        external_message_id: clip(m.externalId, 300),
        direction: m.direction,
        sender_name: m.senderName ? clip(m.senderName, 200) : null,
        body_text: clip(m.body, 20000),
        sent_at: m.sentAt.toISOString(),
        sent_by: extra?.sentBy ?? null,
        ai_assisted: extra?.aiAssisted ?? false,
        metadata: (m.metadata ?? {}) as Json,
        expires_at: new Date(Math.min(m.sentAt.getTime(), Date.now()) + RETENTION_DAYS * DAY).toISOString(),
      })),
      { onConflict: "thread_id,external_message_id", ignoreDuplicates: true },
    );
}

// -------------------------------------------------------------------------------------------------
// Webhook de Instagram (mensajes entrantes y ecos de los enviados desde la app de Instagram)
// -------------------------------------------------------------------------------------------------
export type IgWebhookEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; is_deleted?: boolean; attachments?: { type?: string }[] };
};

/** Normaliza un evento del webhook. Devuelve null si no es un mensaje que debamos guardar. */
export function parseIgEvent(igAccountId: string, ev: IgWebhookEvent): { igsid: string; message: SyncedMessage } | null {
  const m = ev.message;
  if (!m?.mid || m.is_deleted) return null;
  const echo = Boolean(m.is_echo);
  const igsid = echo ? ev.recipient?.id : ev.sender?.id;
  if (!igsid || igsid === igAccountId) return null;
  const attachment = m.attachments?.[0]?.type;
  const body = m.text ?? (attachment ? `[${attachment}]` : "");
  return {
    igsid,
    message: { externalId: m.mid, direction: echo ? "out" : "in", senderName: null, body: clip(body, 2000), sentAt: new Date(ev.timestamp ?? Date.now()) },
  };
}

/** Guarda un mensaje del webhook en cada proyecto que tenga esa cuenta de Instagram conectada a la bandeja. */
export async function ingestIgEvent(igAccountId: string, ev: IgWebhookEvent): Promise<string[]> {
  const parsed = parseIgEvent(igAccountId, ev);
  if (!parsed) return [];
  const { data: conns } = await admin()
    .from("inbox_connections")
    .select("id, workspace_id, project_id, channel, external_id, metadata, status")
    .eq("channel", "instagram")
    .eq("external_id", igAccountId)
    .eq("status", "active");
  const threadIds: string[] = [];
  for (const conn of conns ?? []) {
    const db = admin();
    const ext = `ig:${parsed.igsid}`;
    const { data: existing } = await db.from("inbox_threads").select("id, counterpart_name, counterpart_handle, last_message_at").eq("connection_id", conn.id).eq("external_thread_id", ext).maybeSingle();
    const m = parsed.message;
    const isNewer = !existing?.last_message_at || m.sentAt.getTime() >= new Date(existing.last_message_at).getTime();
    const id = await storeThread(
      conn,
      {
        externalThreadId: ext,
        subject: null,
        counterpartName: existing?.counterpart_name ?? null,
        counterpartHandle: existing?.counterpart_handle ?? null,
        unread: m.direction === "in",
        // Si llega desordenado (Meta puede reenviar), no pisamos el estado del hilo con un mensaje antiguo.
        messages: isNewer ? [m] : [],
        metadata: { igsid: parsed.igsid },
      },
      { emailUnread: false },
    );
    if (!isNewer && existing) await insertMessages(conn.workspace_id, existing.id, [m]);
    const tid = id ?? existing?.id;
    if (tid) threadIds.push(tid);
  }
  return threadIds;
}

/** Completa el @usuario de un hilo de Instagram (User Profile API). */
export async function enrichIgThread(threadId: string) {
  const db = admin();
  const { data: th } = await db.from("inbox_threads").select("id, connection_id, metadata, counterpart_handle").eq("id", threadId).maybeSingle();
  if (!th || th.counterpart_handle) return;
  const igsid = String((th.metadata as { igsid?: string } | null)?.igsid ?? "");
  const conn = await loadConnection(th.connection_id);
  if (!conn || !igsid) return;
  const token = await freshAccessToken(conn);
  const p = isInstagramLogin(conn.metadata) ? await igLoginUserProfile(igsid, token) : await igUserProfile(igsid, token);
  await db
    .from("inbox_threads")
    .update({ counterpart_handle: p.username ?? null, counterpart_name: p.username ? `@${p.username}` : (p.name ?? null) })
    .eq("id", th.id);
}
