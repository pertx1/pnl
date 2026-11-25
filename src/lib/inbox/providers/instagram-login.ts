import "server-only";
import { platformErrorDetail } from "@/lib/social/http";
import { igGraph } from "@/lib/social/instagram-login";
import { InboxError } from "../config";
import { inboxFetch } from "../http";
import { clip } from "../mime";
import type { SyncedThread } from "../types";

/**
 * Mensajes de Instagram con **Instagram API with Instagram Login** (graph.instagram.com, token de usuario de Instagram).
 * Sin página de Facebook. Permisos: instagram_business_basic + instagram_business_manage_messages.
 * Docs oficiales:
 *  - Enviar: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
 *    ("/<IG_ID>/messages or /me/messages", "Authorization: Bearer <INSTAGRAM_USER_ACCESS_TOKEN>")
 *  - Conversaciones: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/conversations-api
 *  - Webhooks: https://developers.facebook.com/documentation/instagram-platform/webhooks/setup
 *    (POST graph.instagram.com/<v>/<INSTAGRAM_ACCOUNT_ID>/subscribed_apps?subscribed_fields=…)
 * El token va SIEMPRE en la cabecera Authorization. Logs: solo códigos de error de la plataforma.
 */
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function fail(res: Response, code: string, where: string): Promise<never> {
  const body = await res.json().catch(() => null);
  const detail = platformErrorDetail(body);
  console.error(`[inbox] instagram-login ${where} http=${res.status}${detail ? ` detail=${detail}` : ""}`);
  const e = (body as { error?: { code?: number; error_subcode?: number } } | null)?.error;
  if (e?.code === 190 || res.status === 401) throw new InboxError("token_expired", res.status);
  throw new InboxError(code, res.status);
}

async function igGet<T>(path: string, token: string, code: string): Promise<T> {
  const res = await inboxFetch(`${igGraph()}${path}`, { headers: bearer(token) });
  if (!res.ok) return fail(res, code, code);
  const body = (await res.json().catch(() => null)) as T | null;
  if (body === null) throw new InboxError(code, res.status);
  return body;
}

/** Suscribe la cuenta profesional a los webhooks de mensajes (campo `messages`). */
export async function igLoginSubscribe(igId: string, token: string) {
  const res = await inboxFetch(`${igGraph()}/${encodeURIComponent(igId)}/subscribed_apps?subscribed_fields=messages`, { method: "POST", headers: bearer(token) });
  if (!res.ok) await fail(res, "subscribe_failed", "subscribe");
}

export async function igLoginUnsubscribe(igId: string, token: string) {
  await inboxFetch(`${igGraph()}/${encodeURIComponent(igId)}/subscribed_apps`, { method: "DELETE", headers: bearer(token) }).catch(() => undefined);
}

type IgMsg = { id: string; created_time: string; from?: { id: string; username?: string }; to?: { data?: { id: string; username?: string }[] }; message?: string };

/**
 * Conversaciones recientes. Límite de Meta: solo los 20 mensajes más recientes de cada conversación tienen detalle;
 * las de «Solicitudes» inactivas 30 días no se devuelven. Hilos por el IGSID de la otra persona (igual que el webhook).
 */
export async function igLoginListThreads(token: string, igId: string, limit = 20): Promise<SyncedThread[]> {
  const fields = "id,updated_time,messages.limit(20){id,created_time,from,to,message}";
  const j = await igGet<{ data?: { id: string; updated_time?: string; messages?: { data?: IgMsg[] } }[] }>(
    `/me/conversations?platform=instagram&fields=${encodeURIComponent(fields)}&limit=${limit}`,
    token,
    "list_failed",
  );
  const out: SyncedThread[] = [];
  for (const c of j.data ?? []) {
    const msgs = c.messages?.data ?? [];
    const other = msgs.map((m) => (m.from?.id !== igId ? m.from : m.to?.data?.find((x) => x.id !== igId))).find(Boolean);
    if (!other?.id) continue;
    out.push({
      externalThreadId: `ig:${other.id}`,
      subject: null,
      counterpartName: other.username ? `@${other.username}` : null,
      counterpartHandle: other.username ?? null,
      unread: false,
      messages: msgs.map((m) => ({
        externalId: m.id,
        direction: m.from?.id === igId ? ("out" as const) : ("in" as const),
        senderName: m.from?.username ? `@${m.from.username}` : null,
        body: clip(m.message ?? "", 2000),
        sentAt: new Date(m.created_time),
      })),
      metadata: { conversationId: c.id, igsid: other.id },
    });
  }
  return out;
}

/** Perfil mínimo de quien escribe (solo @usuario y nombre). */
export async function igLoginUserProfile(igsid: string, token: string) {
  if (!/^\d{5,30}$/.test(igsid)) throw new InboxError("bad_id");
  return igGet<{ name?: string; username?: string }>(`/${igsid}?fields=name,username`, token, "profile_failed");
}

/**
 * Envía UNA respuesta (tras el clic humano). Dentro de la ventana estándar de 24 h no se usa etiqueta; `humanAgent`
 * añade HUMAN_AGENT (7 días) solo si Meta aprobó esa función y la respuesta la escribe/aprueba una persona.
 */
export async function igLoginSendReply(token: string, o: { igsid: string; text: string; humanAgent: boolean }) {
  const body: Record<string, unknown> = { recipient: { id: o.igsid }, message: { text: o.text } };
  if (o.humanAgent) Object.assign(body, { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
  const res = await inboxFetch(
    `${igGraph()}/me/messages`,
    { method: "POST", headers: { ...bearer(token), "Content-Type": "application/json" }, body: JSON.stringify(body) },
    1,
  );
  const j = (await res.clone().json().catch(() => null)) as { message_id?: string; error?: { code?: number; error_subcode?: number } } | null;
  if (!res.ok || !j?.message_id) {
    if (j?.error?.code === 10 || j?.error?.error_subcode === 2018278 || j?.error?.error_subcode === 2534022) {
      console.error(`[inbox] instagram-login send http=${res.status} detail=${platformErrorDetail(j) ?? "window"}`);
      throw new InboxError("window_closed", res.status);
    }
    await fail(res, "send_failed", "send");
  }
  return { externalId: j!.message_id! };
}
