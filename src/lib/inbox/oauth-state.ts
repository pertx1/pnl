import "server-only";
import { createHash } from "node:crypto";
import { randomToken, sign, verify } from "@/lib/crypto/tokens";

/** Estado OAuth de la bandeja (anti-CSRF + PKCE), firmado con HMAC en una cookie httpOnly de 10 min. */
export type InboxOAuthState = { state: string; projectId: string; accountId?: string; verifier: string; exp: number };

export const inboxStateCookie = (provider: string) => `kreo_inbox_${provider}`;
export const INBOX_COOKIE_PATH = "/api/inbox/oauth";

export function newInboxState(projectId: string, accountId?: string) {
  const value: InboxOAuthState = { state: randomToken(24), projectId, accountId, verifier: randomToken(48), exp: Date.now() + 10 * 60 * 1000 };
  const challenge = createHash("sha256").update(value.verifier).digest("base64url");
  return { value, challenge, cookie: sign(Buffer.from(JSON.stringify(value)).toString("base64url")) };
}

export function readInboxState(cookie: string | undefined): InboxOAuthState | null {
  if (!cookie) return null;
  const raw = verify(cookie);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as InboxOAuthState;
    return parsed.exp > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}
