import "server-only";
import { InboxError } from "../config";
import { inboxFetch, inboxJson } from "../http";
import { clip, htmlToText, stripQuoted } from "../mime";
import type { InboxTokenSet, SyncedThread } from "../types";

/**
 * Outlook / Microsoft 365 vía Microsoft identity platform (OAuth 2.0 + PKCE, tenant "common") y Microsoft Graph.
 * Scopes MÍNIMOS: Mail.Read (leer), Mail.Send (responder), offline_access (refresh token).
 * `openid email` solo para saber qué buzón se ha conectado (claim del id_token; no llamamos a /me).
 * Docs: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
 *       https://learn.microsoft.com/en-us/graph/api/message-reply
 */
export const OUTLOOK_SCOPES = ["openid", "email", "offline_access", "https://graph.microsoft.com/Mail.Read", "https://graph.microsoft.com/Mail.Send"];
const LOGIN = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0/me";

const creds = () => ({ id: process.env.MICROSOFT_CLIENT_ID ?? "", secret: process.env.MICROSOFT_CLIENT_SECRET ?? "" });

export function outlookAuthorizeUrl(o: { state: string; redirectUri: string; codeChallenge: string }) {
  const p = new URLSearchParams({
    client_id: creds().id,
    response_type: "code",
    redirect_uri: o.redirectUri,
    response_mode: "query",
    scope: OUTLOOK_SCOPES.join(" "),
    state: o.state,
    code_challenge: o.codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${LOGIN}/authorize?${p}`;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string };

async function token(params: Record<string, string>): Promise<InboxTokenSet & { email: string | null }> {
  const res = await inboxFetch(`${LOGIN}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: creds().id, client_secret: creds().secret, scope: OUTLOOK_SCOPES.join(" "), ...params }),
  });
  const j = (await res.json().catch(() => null)) as TokenResponse | null;
  if (!res.ok || !j?.access_token) throw new InboxError(j?.error === "invalid_grant" ? "token_expired" : "token_exchange_failed", res.status);
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    accessExpiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : undefined,
    grantedScopes: (j.scope ?? "").split(" ").filter(Boolean),
    email: emailFromIdToken(j.id_token),
  };
}

/** Lee el email del id_token SOLO para mostrarlo (Microsoft lo permite para clientes confidenciales; no se usa para autorizar). */
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string; preferred_username?: string };
    const e = payload.email ?? payload.preferred_username ?? null;
    return e && e.includes("@") ? e.toLowerCase() : null;
  } catch {
    return null;
  }
}

export const outlookExchange = (code: string, redirectUri: string, verifier: string) =>
  token({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier });
export const outlookRefresh = (refreshToken: string) => token({ grant_type: "refresh_token", refresh_token: refreshToken });

const auth = (t: string) => ({ Authorization: `Bearer ${t}`, Prefer: 'outlook.body-content-type="text"' });

type GraphMessage = {
  id: string;
  conversationId: string;
  subject?: string | null;
  from?: { emailAddress?: { name?: string; address?: string } };
  replyTo?: { emailAddress?: { name?: string; address?: string } }[];
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  body?: { contentType?: string; content?: string };
};

const SELECT = "id,conversationId,subject,from,replyTo,toRecipients,receivedDateTime,sentDateTime,isRead,body";

function bodyText(m: GraphMessage) {
  const raw = m.body?.content ?? "";
  return clip(stripQuoted(m.body?.contentType === "html" ? htmlToText(raw) : raw), 8000);
}

/** Conversaciones de la bandeja de entrada de los últimos 30 días + nuestras respuestas enviadas en ellas. */
export async function outlookListThreads(accessToken: string, limit = 25): Promise<SyncedThread[]> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const inboxQ = new URLSearchParams({ $top: String(limit), $select: SELECT, $filter: `receivedDateTime ge ${since}`, $orderby: "receivedDateTime desc" });
  const sentQ = new URLSearchParams({ $top: "50", $select: SELECT, $filter: `sentDateTime ge ${since}`, $orderby: "sentDateTime desc" });
  const [inbox, sent] = await Promise.all([
    inboxJson<{ value: GraphMessage[] }>(await inboxFetch(`${GRAPH}/mailFolders/inbox/messages?${inboxQ}`, { headers: auth(accessToken) }), "list_failed"),
    inboxJson<{ value: GraphMessage[] }>(await inboxFetch(`${GRAPH}/mailFolders/sentitems/messages?${sentQ}`, { headers: auth(accessToken) }), "list_failed"),
  ]);

  const byConv = new Map<string, SyncedThread>();
  for (const m of inbox.value) {
    const t = byConv.get(m.conversationId) ?? {
      externalThreadId: m.conversationId,
      subject: m.subject ? clip(m.subject, 300) : null,
      counterpartName: null,
      counterpartHandle: null,
      unread: false,
      messages: [],
    };
    const from = m.from?.emailAddress;
    const replyTo = m.replyTo?.[0]?.emailAddress;
    t.counterpartName = t.counterpartName ?? from?.name ?? null;
    t.counterpartHandle = t.counterpartHandle ?? (replyTo?.address ?? from?.address ?? null)?.toLowerCase() ?? null;
    t.unread = t.unread || m.isRead === false;
    t.messages.push({ externalId: m.id, direction: "in", senderName: from?.name ?? from?.address ?? null, body: bodyText(m), sentAt: new Date(m.receivedDateTime ?? Date.now()) });
    byConv.set(m.conversationId, t);
  }
  for (const m of sent.value) {
    const t = byConv.get(m.conversationId);
    if (!t) continue; // solo nuestras respuestas en conversaciones existentes
    t.messages.push({ externalId: m.id, direction: "out", senderName: null, body: bodyText(m), sentAt: new Date(m.sentDateTime ?? Date.now()) });
  }
  return [...byConv.values()];
}

/**
 * Responde al mensaje recibido (Graph lo envía al remitente o a su Reply-To y lo guarda en Enviados).
 * Un único intento (no reintenta para no duplicar). Graph devuelve 202 sin id.
 */
export async function outlookSendReply(accessToken: string, o: { messageId: string; body: string }) {
  const res = await inboxFetch(
    `${GRAPH}/messages/${encodeURIComponent(o.messageId)}/reply`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { body: { contentType: "Text", content: o.body } } }),
    },
    1,
  );
  if (res.status === 401) throw new InboxError("token_expired", 401);
  if (res.status !== 202 && !res.ok) throw new InboxError("send_failed", res.status);
}
