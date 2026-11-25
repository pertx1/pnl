import "server-only";
import { platformErrorDetail } from "@/lib/social/http";
import { COMMENT_MEDIA_LIMIT, COMMENTS_PER_MEDIA, flattenComments, parseMediaList } from "../comments";
import { InboxError } from "../config";
import { inboxFetch, inboxJson } from "../http";
import { parseAssignedAccounts, parseDebugToken, type AssignedIgAccount, type DebugTokenInfo } from "../meta-scopes";
import { appSecretProof } from "../meta-signature";
import { clip } from "../mime";
import type { InboxTokenSet, SyncedThread } from "../types";

/**
 * Instagram con **Facebook Login for Business** (`graph.facebook.com`, app de Meta). Oficial. Dos variantes:
 *
 * A) **Instagram API with Unified Login** (configuración «Instagram API (Unified Login)», p. ej. META_INBOX_LOGIN_CONFIG_ID):
 *    el code se cambia por un Business Integration System User Access Token (BISU). Sin página de Facebook:
 *    `/me/assigned_instagram_accounts`, `/<IG_ID>/conversations`, `/<IG_ID>/messages`, `/<IG_ID>/subscribed_apps`,
 *    `/<IG_ID>/media`, `/<MEDIA_ID>/comments`, `/<COMMENT_ID>/replies`.
 *    Permisos: instagram_basic + instagram_manage_messages (+ instagram_manage_comments para comentarios).
 *    https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started
 *    https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/migration-guide
 *
 * B) **Instagram API with Facebook Login** clásica (página de Facebook): token de usuario largo → `/me/accounts` →
 *    token de página. Permisos: instagram_basic, instagram_manage_messages, pages_manage_metadata, pages_show_list.
 *    https://developers.facebook.com/documentation/business-messaging/instagram-messaging/get-started
 *
 * Se guarda SOLO el token que hace falta (BISU o token de página), cifrado. El token va en la cabecera Authorization
 * con `appsecret_proof`. Logs: solo códigos de error de la plataforma.
 */
const version = () => process.env.META_GRAPH_VERSION ?? "v27.0";
const GRAPH = () => `https://graph.facebook.com/${version()}`;
const creds = () => ({ id: process.env.META_APP_ID ?? "", secret: process.env.META_APP_SECRET ?? "" });

/** Cabecera Authorization + appsecret_proof (el token nunca va en la URL). */
function authed(url: string, token: string) {
  const u = new URL(url);
  u.searchParams.set("appsecret_proof", appSecretProof(token, creds().secret));
  return { url: u.toString(), headers: { Authorization: `Bearer ${token}` } };
}

async function fail(res: Response, code: string, where: string): Promise<never> {
  const body = await res.json().catch(() => null);
  const detail = platformErrorDetail(body);
  console.error(`[inbox] instagram ${where} http=${res.status}${detail ? ` detail=${detail}` : ""}`);
  if ((body as { error?: { code?: number } } | null)?.error?.code === 190 || res.status === 401) throw new InboxError("token_expired", res.status);
  throw new InboxError(code, res.status);
}

async function graphGet<T>(path: string, token: string, code: string): Promise<T> {
  const { url, headers } = authed(`${GRAPH()}${path}`, token);
  const res = await inboxFetch(url, { headers });
  if (!res.ok) return fail(res, code, code);
  const body = (await res.json().catch(() => null)) as T | null;
  if (body === null) throw new InboxError(code, res.status);
  return body;
}

async function graphPost(path: string, token: string, code: string, json?: unknown, attempts = 3): Promise<Record<string, unknown>> {
  const { url, headers } = authed(`${GRAPH()}${path}`, token);
  const init: RequestInit = json === undefined ? { method: "POST", headers } : { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(json) };
  const res = await inboxFetch(url, init, attempts);
  if (!res.ok) return fail(res, code, code);
  return ((await res.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
}

export function igAuthorizeUrl(o: { state: string; redirectUri: string }) {
  const p = new URLSearchParams({ client_id: creds().id, redirect_uri: o.redirectUri, state: o.state, response_type: "code" });
  // Facebook Login for Business: configuración propia de la Bandeja (Unified Login) o, si no hay, la de publicación.
  const configId = process.env.META_INBOX_LOGIN_CONFIG_ID || process.env.META_LOGIN_CONFIG_ID;
  if (configId) p.set("config_id", configId);
  else p.set("scope", ["instagram_basic", "instagram_manage_messages", "pages_manage_metadata", "pages_show_list"].join(","));
  return `https://www.facebook.com/${version()}/dialog/oauth?${p}`;
}

/** code → token (BISU con Unified Login; token de usuario corto con Facebook Login clásico). GET documentado por Meta. */
export async function igExchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string; expiresIn?: number }> {
  const { id, secret } = creds();
  const j = await inboxJson<{ access_token: string; expires_in?: number }>(
    await inboxFetch(`${GRAPH()}/oauth/access_token?${new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: redirectUri, code })}`),
    "token_exchange_failed",
  );
  if (!j.access_token) throw new InboxError("token_exchange_failed");
  return { accessToken: j.access_token, expiresIn: j.expires_in };
}

/**
 * Permisos concedidos y caducidad de un token (`GET /debug_token` con el token de app). Sirve para BISU y para tokens
 * de usuario. Si falla, se intenta `/me/permissions` (tokens de usuario).
 * https://developers.facebook.com/docs/graph-api/reference/debug_token/
 */
export async function igTokenInfo(token: string): Promise<DebugTokenInfo> {
  const { id, secret } = creds();
  const res = await inboxFetch(`${GRAPH()}/debug_token?${new URLSearchParams({ input_token: token, access_token: `${id}|${secret}` })}`);
  const info = res.ok ? parseDebugToken(await res.json().catch(() => null)) : null;
  if (info?.valid) return info;
  const perms = await graphGet<{ data?: { permission: string; status: string }[] }>("/me/permissions", token, "permissions_failed");
  return { valid: true, scopes: (perms.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission), expiresAt: null };
}

/** Unified Login: cuentas de Instagram compartidas con la app. `null` si el token no es BISU (Facebook Login clásico). */
export async function igAssignedAccounts(token: string): Promise<AssignedIgAccount[] | null> {
  const { url, headers } = authed(`${GRAPH()}/me/assigned_instagram_accounts?fields=id,username&limit=100`, token);
  const res = await inboxFetch(url, { headers });
  if (!res.ok) return null;
  return parseAssignedAccounts(await res.json().catch(() => null));
}

/** Unified Login: id del portfolio del cliente (para gestionar el token con la API de BISU). Opcional. */
export async function igClientBusinessId(token: string): Promise<string | null> {
  const j = await graphGet<{ client_business_id?: string }>("/me?fields=client_business_id", token, "profile_failed").catch(() => null);
  return j?.client_business_id && /^\d{1,30}$/.test(j.client_business_id) ? j.client_business_id : null;
}

/** Facebook Login clásico: token de usuario de larga duración (para que el token de página no caduque). */
export async function igLongLived(shortToken: string): Promise<InboxTokenSet> {
  const { id, secret } = creds();
  const long = await inboxJson<{ access_token: string; expires_in?: number }>(
    await inboxFetch(
      `${GRAPH()}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: shortToken })}`,
    ),
    "token_exchange_failed",
  );
  const info = await igTokenInfo(long.access_token);
  return {
    accessToken: long.access_token,
    accessExpiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : undefined,
    grantedScopes: info.scopes,
  };
}

/** Facebook Login clásico: páginas del usuario con su cuenta de Instagram vinculada y su token de página. */
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

/** Facebook Login clásico: suscribe la página a los webhooks de mensajes. */
export async function igSubscribePage(pageId: string, pageToken: string) {
  await graphPost(`/${pageId}/subscribed_apps?subscribed_fields=messages`, pageToken, "subscribe_failed");
}

export async function igUnsubscribePage(pageId: string, pageToken: string) {
  const { url, headers } = authed(`${GRAPH()}/${pageId}/subscribed_apps`, pageToken);
  await inboxFetch(url, { method: "DELETE", headers }).catch(() => undefined);
}

/**
 * Unified Login: suscribe la cuenta de Instagram a los campos indicados (deben estar marcados en el panel de Meta).
 * `POST graph.facebook.com/<IG_ID>/subscribed_apps?subscribed_fields=messages,comments`.
 */
export async function igSubscribeAccount(igId: string, token: string, fields: string[]) {
  if (!/^\d{1,30}$/.test(igId) || !fields.length) throw new InboxError("bad_id");
  await graphPost(`/${igId}/subscribed_apps?subscribed_fields=${encodeURIComponent(fields.join(","))}`, token, "subscribe_failed");
}

export async function igUnsubscribeAccount(igId: string, token: string) {
  if (!/^\d{1,30}$/.test(igId)) return;
  const { url, headers } = authed(`${GRAPH()}/${igId}/subscribed_apps`, token);
  await inboxFetch(url, { method: "DELETE", headers }).catch(() => undefined);
}

type IgMsg = { id: string; created_time: string; from?: { id: string; username?: string }; to?: { data?: { id: string; username?: string }[] }; message?: string };

/**
 * Conversaciones recientes (Conversations API). Límite de Meta: solo los 20 últimos mensajes de cada conversación
 * devuelven detalle. Hilos identificados por el IGSID de la otra persona (igual que en el webhook).
 * `owner`: id de la página (Facebook Login clásico, con `platform=instagram`) o de la cuenta de Instagram (Unified Login).
 */
export async function igListThreads(owner: { pageId: string } | { igId: string }, token: string, igId: string, limit = 20): Promise<SyncedThread[]> {
  const fields = "id,updated_time,messages.limit(20){id,created_time,from,to,message}";
  const path =
    "pageId" in owner
      ? `/${owner.pageId}/conversations?platform=instagram&fields=${encodeURIComponent(fields)}&limit=${limit}`
      : `/${owner.igId}/conversations?fields=${encodeURIComponent(fields)}&limit=${limit}`;
  const j = await graphGet<{ data?: { id: string; updated_time?: string; messages?: { data?: IgMsg[] } }[] }>(path, token, "list_failed");
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

/** Perfil público mínimo de quien escribe (User Profile API): solo @usuario y nombre. */
export async function igUserProfile(igsid: string, token: string) {
  if (!/^\d{5,30}$/.test(igsid)) throw new InboxError("bad_id");
  return graphGet<{ name?: string; username?: string }>(`/${igsid}?fields=name,username`, token, "profile_failed");
}

/**
 * Envía un DM de respuesta con la Send API. `humanAgent` añade la etiqueta HUMAN_AGENT (solo si Meta la aprobó
 * y la respuesta la escribe/aprueba una persona). Un único intento.
 * `sender`: "me" (token de página) o el id de la cuenta de Instagram (Unified Login: `/<IG_ID>/messages`).
 */
export async function igSendReply(token: string, o: { igsid: string; text: string; humanAgent: boolean; sender?: string }) {
  const body: Record<string, unknown> = { recipient: { id: o.igsid }, message: { text: o.text } };
  if (o.humanAgent) Object.assign(body, { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
  else body.messaging_type = "RESPONSE";
  const sender = o.sender && /^\d{1,30}$/.test(o.sender) ? o.sender : "me";
  const { url, headers } = authed(`${GRAPH()}/${sender}/messages`, token);
  const res = await inboxFetch(url, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) }, 1);
  const j = (await res.clone().json().catch(() => null)) as { message_id?: string; error?: { code?: number; error_subcode?: number } } | null;
  if (!res.ok || !j?.message_id) {
    if (j?.error?.code === 10 || j?.error?.error_subcode === 2018278 || j?.error?.error_subcode === 2534022) throw new InboxError("window_closed", res.status);
    return fail(res, "send_failed", "send");
  }
  return { externalId: j.message_id };
}

// -------------------------------------------------------------------------------------------------
// Comentarios (Unified Login · instagram_basic + instagram_manage_comments)
// -------------------------------------------------------------------------------------------------

/** Las 25 últimas publicaciones propias (solo las que tienen comentarios). */
export async function igListRecentMedia(igId: string, token: string) {
  if (!/^\d{1,30}$/.test(igId)) throw new InboxError("bad_id");
  const fields = "id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp,comments_count";
  const j = await graphGet<unknown>(`/${igId}/media?fields=${encodeURIComponent(fields)}&limit=${COMMENT_MEDIA_LIMIT}`, token, "comments_failed");
  return parseMediaList(j);
}

/** Comentarios de una publicación (máx. 50 de primer nivel, con sus respuestas) de los últimos 30 días. */
export async function igListMediaComments(mediaId: string, token: string, igId: string) {
  if (!/^\d{1,40}$/.test(mediaId)) throw new InboxError("bad_id");
  const c = "id,text,timestamp,username,from,user,hidden";
  const fields = `${c},replies.limit(${COMMENTS_PER_MEDIA}){${c}}`;
  const j = await graphGet<unknown>(`/${mediaId}/comments?fields=${encodeURIComponent(fields)}&limit=${COMMENTS_PER_MEDIA}`, token, "comments_failed");
  return flattenComments(j, igId);
}

/** Responde en el hilo de un comentario de primer nivel. Un único intento (tras el clic humano). */
export async function igReplyToComment(commentId: string, token: string, message: string) {
  if (!/^\d{1,40}$/.test(commentId)) throw new InboxError("bad_id");
  const j = await graphPost(`/${commentId}/replies`, token, "comment_failed", { message }, 1);
  const id = typeof j.id === "string" ? j.id : null;
  if (!id) throw new InboxError("comment_failed");
  return { externalId: id };
}

/** Oculta o vuelve a mostrar un comentario (`POST /<COMMENT_ID>?hide=true|false`). */
export async function igHideComment(commentId: string, token: string, hide: boolean) {
  if (!/^\d{1,40}$/.test(commentId)) throw new InboxError("bad_id");
  await graphPost(`/${commentId}?hide=${hide ? "true" : "false"}`, token, "comment_failed", undefined, 1);
}
