import "server-only";
import { notifyAccountIssue } from "@/lib/notifications/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter } from "./index";
import { loadTokens, saveTokens } from "./token-store";
import type { Platform, TokenSet } from "./types";

/** No hay tokens utilizables: la cuenta hay que reconectarla. */
export class TokenUnavailableError extends Error {
  constructor(public code: "missing_tokens" | "token_expired") {
    super(code);
  }
}

/**
 * Tokens vigentes de una cuenta conectada; si caducan en < 5 min los refresca. Si no se puede, marca la cuenta
 * como caducada (la app pide reconectar). Lo usan el worker y la subida directa a YouTube. Solo servidor.
 */
export async function getFreshTokens(accountId: string, platform: Platform): Promise<TokenSet> {
  const adapter = getAdapter(platform)!;
  const tokens = await loadTokens(accountId);
  if (!tokens) throw new TokenUnavailableError("missing_tokens");
  const expiresSoon = tokens.accessExpiresAt && tokens.accessExpiresAt.getTime() < Date.now() + 5 * 60_000;
  if (!expiresSoon) return tokens;
  try {
    const refreshed = await adapter.refresh(tokens.refreshToken ?? tokens.accessToken);
    await saveTokens(accountId, { ...refreshed, refreshToken: refreshed.refreshToken ?? tokens.refreshToken });
    return refreshed;
  } catch {
    await markAccountExpired(accountId);
    throw new TokenUnavailableError("token_expired");
  }
}

/** Marca la cuenta como caducada (p. ej. Google responde 401 con un token que creíamos vigente). */
export async function markAccountExpired(accountId: string) {
  const db = createAdminClient();
  if (!db) return;
  const { data: changed } = await db.from("social_accounts").update({ status: "expired" }).eq("id", accountId).neq("status", "expired").select("id");
  // Aviso solo al pasar a caducada (nunca rompe el flujo: notifyAccountIssue captura sus errores).
  if (changed?.length) await notifyAccountIssue(db, accountId);
}
