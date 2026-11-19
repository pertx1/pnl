import "server-only";
import { InboxError } from "../config";
import { inboxFetch, inboxJson } from "../http";
import { appSecretProof } from "../meta-signature";
import { clip } from "../mime";
import type { InboxTokenSet, SyncedThread } from "../types";

/**
 * Instagram Messaging API (Messenger Platform, Instagram API con Facebook Login). Oficial.
 * Permisos MÍNIMOS para la bandeja (se piden aparte del módulo de publicación, solo si el usuario activa la bandeja):
 *  - instagram_basic, instagram_manage_messages: leer y responder DMs.
 *  - pages_manage_metadata: suscribir la página a los webhooks de mensajes.
 *  - pages_show_list: obtener el token de la página vinculada a la cuenta de Instagram.
 * Se guarda SOLO el token de la página (no el del usuario), cifrado.
 * Docs: https://developers.facebook.com/documentation/business-messaging/instagram-messaging/get-started
 *       https://developers.facebook.com/docs/messenger-platform/conversations
 *       https://developers.facebook.com/docs/messenger-platform/instagram/features/send-message
 */
export const IG_INBOX_SCOPES = ["instagram_basic", "instagram_manage_messages", "pages_manage_metadata", "pages_show_list"];

const version = () => process.env.META_GRAPH_VERSION ?? "v23.0";
const GRAPH = () => `https://graph.facebook.com/${version()}`;
const creds = () => ({ id: process.env.META_APP_ID ?? "", secret: process.env.META_APP_SECRET ?? "" });

/** Cabecera Authorization + appsecret_proof (el token nunca va en la URL). */
function authed(url: string, token: string) {
  const u = new URL(url);
  u.searchParams.set("appsecret_proof", appSecretProof(token, creds().secret));
  return { url: u.toString(), headers: { Authorization: `Bearer ${token}` } };
}

async function graphGet<T>(path: string, token: string, code: string) {
  const { url, headers } = authed(`${GRAPH()}${path}`, token);
  const res = await inboxFetch(url, { headers });
  if (res.status === 400 || res.status === 401) {
    const j = (await res.json().catch(() => null)) as { error?: { code?: number } } | null;
    if (j?.error?.code === 190) throw new InboxError("token_expired", res.status);
    throw new InboxError(code, res.status);
  }
  return inboxJson<T>(res, code);
}

export function igAuthorizeUrl(o: { state: string; redirectUri: string }) {
  const p = new URLSearchParams({ client_id: creds().id, redirect_uri: o.redirectUri, state: o.state, response_type: "code", scope: IG_INBOX_SCOPES.join(",") });
  return `https://www.facebook.com/${version()}/dialog/oauth?${p}`;
}

/** code → token de usuario de larga duración (necesario para que el token de página no caduque). */
export async function igExchange(code: string, redirectUri: string): Promise<InboxTokenSet> {
  const { id, secret } = creds();
  // Endpoint documentado por Meta como GET con parámetros (igual que src/lib/social/platforms/instagram.ts).
  const short = await inboxJson<{ access_token: string }>(
    await inboxFetch(`${GRAPH()}/oauth/access_token?${new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: redirectUri, code })}`),
    "token_exchange_failed",
  );
  const long = await inboxJson<{ access_token: string; expires_in?: number }>(
    await inboxFetch(
      `${GRAPH()}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: short.access_token })}`,
    ),
    "token_exchange_failed",
  );
  const perms = await graphGet<{ data: { permission: string; status: string }[] }>("/me/permissions", long.access_token, "permissions_failed");
  return {
    accessToken: long.access_token,
    accessExpiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : undefined,
    grantedScopes: perms.data.filter((p) => p.status === "granted").map((p) => p.permission),
  };
}

/** Páginas del usuario con su cuenta de Instagram vinculada y su token de página. */
export async function igPages(userToken: string) {
  const fields = "id,name,access_token,instagram_business_account{id,username,name}";
  const j = await graphGet<{ data: { id: string; name: string; access_token?: string; instagram_business_account?: { id: string; username?: string; name?: string } }[] }>(
    `/me/accounts?fields=${encodeURIComponent(fields)}&limit=100`,
    userToken,
    "profile_failed",
  );
  return j.data
    .filter((p) => p.instagram_business_account && p.access_token)
    .map((p) => ({ pageId: p.id, pageToken: p.access_token!, igId: p.instagram_business_account!.id, username: p.instagram_business_account!.username ?? null, name: p.instagram_business_account!.name ?? p.name }));
}

/** Suscribe la página a los webhooks de mensajes (campo `messages`). */
export async function igSubscribePage(pageId: string, pageToken: string) {
  const { url, headers } = authed(`${GRAPH()}/${pageId}/subscribed_apps?subscribed_fields=messages`, pageToken);
  const res = await inboxFetch(url, { method: "POST", headers });
  if (!res.ok) throw new InboxError("subscribe_failed", res.status);
}

export async function igUnsubscribePage(pageId: string, pageToken: string) {
  const { url, headers } = authed(`${GRAPH()}/${pageId}/subscribed_apps`, pageToken);
  await inboxFetch(url, { method: "DELETE", headers }).catch(() => undefined);
}

type IgMsg = { id: string; created_time: string; from?: { id: string; username?: string }; to?: { data?: { id: string; username?: string }[] }; message?: string };

/**
 * Conversaciones recientes (Conversations API). Límite de Meta: solo los 20 últimos mensajes de cada conversación
 * devuelven detalle. Hilos identificados por el IGSID de la otra persona (igual que en el webhook).
 */
export async function igListThreads(pageId: string, pageToken: string, igId: string, limit = 20): Promise<SyncedThread[]> {
  const fields = "id,updated_time,messages.limit(20){id,created_time,from,to,message}";
  const j = await graphGet<{ data: { id: string; updated_time?: string; messages?: { data?: IgMsg[] } }[] }>(
    `/${pageId}/conversations?platform=instagram&fields=${encodeURIComponent(fields)}&limit=${limit}`,
    pageToken,
    "list_failed",
  );
  const out: SyncedThread[] = [];
  for (const c of j.data) {
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

/** Perfil público mínimo de quien escribe (User Profile API): solo @usuario y nombre. */
export async function igUserProfile(igsid: string, pageToken: string) {
  if (!/^\d{5,30}$/.test(igsid)) throw new InboxError("bad_id");
  return graphGet<{ name?: string; username?: string }>(`/${igsid}?fields=name,username`, pageToken, "profile_failed");
}

/**
 * Envía un DM de respuesta con la Send API. `humanAgent` añade la etiqueta HUMAN_AGENT (solo si Meta la aprobó
 * y la respuesta la escribe/aprueba una persona). Un único intento.
 */
export async function igSendReply(pageToken: string, o: { igsid: string; text: string; humanAgent: boolean }) {
  const body: Record<string, unknown> = { recipient: { id: o.igsid }, message: { text: o.text } };
  if (o.humanAgent) Object.assign(body, { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
  else body.messaging_type = "RESPONSE";
  const { url, headers } = authed(`${GRAPH()}/me/messages`, pageToken);
  const res = await inboxFetch(url, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) }, 1);
  const j = (await res.json().catch(() => null)) as { message_id?: string; error?: { code?: number; error_subcode?: number } } | null;
  if (!res.ok || !j?.message_id) {
    if (j?.error?.code === 190) throw new InboxError("token_expired", res.status);
    if (j?.error?.code === 10 || j?.error?.error_subcode === 2018278) throw new InboxError("window_closed", res.status);
    throw new InboxError("send_failed", res.status);
  }
  return { externalId: j.message_id };
}
