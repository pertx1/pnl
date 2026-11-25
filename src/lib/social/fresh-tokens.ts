import "server-only";
import { notifyAccountIssue } from "@/lib/notifications/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter } from "./index";
import { loadTokens, saveTokens } from "./token-store";
import { igRefreshDue, isInstagramLogin } from "./instagram-login";
import { PlatformError, type Platform, type TokenSet } from "./types";

/** No hay tokens utilizables: la cuenta hay que reconectarla. */
export class TokenUnavailableError extends Error {
  constructor(public code: "missing_tokens" | "token_expired") {
    super(code);
  }
}

/**
 * Tokens vigentes de una cuenta conectada; si caducan en < 5 min los refresca. Si no se puede, marca la cuenta
 * como caducada (la app pide reconectar). Lo usan el worker y la subida directa a YouTube. Solo servidor.
 * Instagram Login: el token largo (60 días) se refresca antes, cuando quedan < 10 días (ver igRefreshDue); si ese
 * refresco anticipado falla pero el token sigue vigente, se sigue usando y se reintenta en la siguiente pasada.
 */
export async function getFreshTokens(accountId: string, platform: Platform): Promise<TokenSet> {
  const adapter = getAdapter(platform)!;
  const tokens = await loadTokens(accountId);
  if (!tokens) throw new TokenUnavailableError("missing_tokens");
  const metadata = platform === "instagram" ? await accountMetadata(accountId) : null;
  const igLogin = isInstagramLogin(metadata);
  const expiresSoon = tokens.accessExpiresAt && tokens.accessExpiresAt.getTime() < Date.now() + 5 * 60_000;
  const early = igLogin && !expiresSoon && igRefreshDue(tokens.accessExpiresAt);
  if (!expiresSoon && !early) return tokens;
  try {
    const refreshed = await adapter.refresh(tokens.refreshToken ?? tokens.accessToken, { metadata });
    await saveTokens(accountId, { ...refreshed, refreshToken: refreshed.refreshToken ?? tokens.refreshToken });
    return refreshed;
  } catch (e) {
    if (early) {
      // Solo el código de la plataforma (nunca el token).
      console.error(`[social] refresco anticipado de instagram falló: ${e instanceof PlatformError ? e.code : "unknown"}`);
      return tokens;
    }
    await markAccountExpired(accountId);
    throw new TokenUnavailableError("token_expired");
  }
}

async function accountMetadata(accountId: string): Promise<Record<string, unknown> | null> {
  const db = createAdminClient();
  if (!db) return null;
  const { data } = await db.from("social_accounts").select("metadata").eq("id", accountId).maybeSingle();
  return (data?.metadata ?? null) as Record<string, unknown> | null;
}

/** Marca la cuenta como caducada (p. ej. Google responde 401 con un token que creíamos vigente). */
export async function markAccountExpired(accountId: string) {
  const db = createAdminClient();
  if (!db) return;
  const { data: changed } = await db.from("social_accounts").update({ status: "expired" }).eq("id", accountId).neq("status", "expired").select("id");
  // Aviso solo al pasar a caducada (nunca rompe el flujo: notifyAccountIssue captura sus errores).
  if (changed?.length) await notifyAccountIssue(db, accountId);
}
