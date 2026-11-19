import "server-only";
import { InboxError } from "../config";
import { inboxFetch, inboxJson } from "../http";
import { buildReplyMime, clip, extractGmailText, header, parseAddress, stripQuoted, toBase64Url } from "../mime";
import type { InboxTokenSet, SyncedThread } from "../types";

/**
 * Gmail API (oficial) con Google OAuth 2.0 + PKCE.
 * Scopes MÍNIMOS: gmail.readonly (leer hilos, restringido → verificación + evaluación de seguridad CASA)
 * y gmail.send (enviar la respuesta, sensible). No pedimos gmail.modify: Kreo no cambia nada en el buzón.
 * Docs: https://developers.google.com/workspace/gmail/api/auth/scopes
 */
export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"];
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

const creds = () => ({ id: process.env.GOOGLE_CLIENT_ID ?? "", secret: process.env.GOOGLE_CLIENT_SECRET ?? "" });

export function gmailAuthorizeUrl(o: { state: string; redirectUri: string; codeChallenge: string }) {
  const p = new URLSearchParams({
    client_id: creds().id,
    redirect_uri: o.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state: o.state,
    code_challenge: o.codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function token(params: Record<string, string>): Promise<InboxTokenSet> {
  const res = await inboxFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: creds().id, client_secret: creds().secret, ...params }),
  });
  const j = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string } | null;
  if (!res.ok || !j?.access_token) throw new InboxError(j?.error === "invalid_grant" ? "token_expired" : "token_exchange_failed", res.status);
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    accessExpiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : undefined,
    grantedScopes: (j.scope ?? "").split(" ").filter(Boolean),
  };
}

export const gmailExchange = (code: string, redirectUri: string, verifier: string) =>
  token({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier });
export const gmailRefresh = (refreshToken: string) => token({ grant_type: "refresh_token", refresh_token: refreshToken });

export async function gmailRevoke(tokenValue: string) {
  await inboxFetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: tokenValue }),
  }).catch(() => undefined);
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

export async function gmailProfile(accessToken: string) {
  const res = await inboxFetch(`${API}/profile`, { headers: auth(accessToken) });
  const j = await inboxJson<{ emailAddress: string }>(res, "profile_failed");
  return { email: j.emailAddress.toLowerCase() };
}

type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[]; mimeType?: string; body?: { data?: string }; parts?: never[] };
};

/**
 * Hilos de la bandeja de entrada de los últimos 30 días (máx. `limit`). Solo descarga los hilos que han cambiado
 * desde la última sincronización (`historyId`), para leer lo mínimo.
 */
export async function gmailListThreads(accessToken: string, selfEmail: string, known: Map<string, string>, limit = 20): Promise<SyncedThread[]> {
  const q = new URLSearchParams({ maxResults: String(limit), q: "in:inbox newer_than:30d -category:promotions -category:social" });
  const list = await inboxJson<{ threads?: { id: string; historyId: string }[] }>(await inboxFetch(`${API}/threads?${q}`, { headers: auth(accessToken) }), "list_failed");
  const changed = (list.threads ?? []).filter((t) => known.get(t.id) !== t.historyId);
  const out: SyncedThread[] = [];
  for (const t of changed) {
    const res = await inboxFetch(`${API}/threads/${encodeURIComponent(t.id)}?format=full`, { headers: auth(accessToken) });
    if (res.status === 404) continue;
    const thread = await inboxJson<{ id: string; historyId: string; messages?: GmailMessage[] }>(res, "thread_failed");
    out.push(toThread(thread, selfEmail));
  }
  return out;
}

function toThread(thread: { id: string; historyId: string; messages?: GmailMessage[] }, selfEmail: string): SyncedThread {
  const msgs = thread.messages ?? [];
  let counterpartName: string | null = null;
  let counterpartHandle: string | null = null;
  let subject: string | null = null;
  const messages = msgs.map((m) => {
    const h = m.payload?.headers;
    const from = parseAddress(header(h, "From"));
    const direction: "in" | "out" = m.labelIds?.includes("SENT") || from.email === selfEmail ? "out" : "in";
    if (direction === "in") {
      const replyTo = parseAddress(header(h, "Reply-To"));
      counterpartName = from.name ?? counterpartName;
      counterpartHandle = replyTo.email ?? from.email ?? counterpartHandle;
    }
    subject = subject ?? header(h, "Subject");
    return {
      externalId: m.id,
      direction,
      senderName: from.name ?? from.email,
      body: clip(stripQuoted(extractGmailText(m.payload as never)), 8000),
      sentAt: new Date(Number(m.internalDate ?? Date.now())),
      metadata: { messageId: header(h, "Message-ID"), references: header(h, "References") },
    };
  });
  return {
    externalThreadId: thread.id,
    subject: subject ? clip(subject, 300) : null,
    counterpartName,
    counterpartHandle,
    unread: msgs.some((m) => m.labelIds?.includes("UNREAD")),
    messages,
    metadata: { historyId: thread.historyId },
  };
}

/** Responde en el MISMO hilo (threadId + In-Reply-To/References + mismo asunto). */
export async function gmailSendReply(accessToken: string, o: { threadId: string; to: string; subject: string | null; inReplyTo: string | null; references: string | null; body: string }) {
  const raw = toBase64Url(buildReplyMime({ to: o.to, subject: o.subject ?? "", inReplyTo: o.inReplyTo, references: o.references, body: o.body }));
  const res = await inboxFetch(`${API}/messages/send`, {
    method: "POST",
    headers: { ...auth(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ raw, threadId: o.threadId }),
  }, 1); // un único intento: nunca reenviar por duplicado
  const j = await inboxJson<{ id: string }>(res, "send_failed");
  return { externalId: j.id };
}
