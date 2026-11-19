import "server-only";
import { createHash } from "node:crypto";
import { randomToken, sign, verify } from "@/lib/crypto/tokens";

export type OAuthState = { state: string; projectId: string; verifier?: string; exp: number };

export const stateCookie = (platform: string) => `kreo_oauth_${platform}`;

export function newState(projectId: string, pkce: boolean) {
  const value: OAuthState = {
    state: randomToken(24),
    projectId,
    verifier: pkce ? randomToken(48) : undefined,
    exp: Date.now() + 10 * 60 * 1000,
  };
  const challenge = value.verifier ? createHash("sha256").update(value.verifier).digest("base64url") : undefined;
  return { value, challenge, cookie: sign(Buffer.from(JSON.stringify(value)).toString("base64url")) };
}

export function readState(cookie: string | undefined): OAuthState | null {
  if (!cookie) return null;
  const raw = verify(cookie);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as OAuthState;
    return parsed.exp > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}
