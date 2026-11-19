import "server-only";
import { decryptToken, encryptToken } from "@/lib/crypto/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TokenSet } from "./types";

/**
 * Lectura/escritura de tokens OAuth cifrados. Solo servidor (service_role): la tabla no tiene políticas RLS.
 * Llamar SIEMPRE después de haber comprobado los permisos del usuario con su propia sesión.
 */
export async function saveTokens(socialAccountId: string, t: TokenSet) {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY no configurada");
  const { error } = await admin.from("social_account_tokens").upsert({
    social_account_id: socialAccountId,
    access_token_enc: encryptToken(t.accessToken),
    refresh_token_enc: t.refreshToken ? encryptToken(t.refreshToken) : null,
    access_expires_at: t.accessExpiresAt?.toISOString() ?? null,
    refresh_expires_at: t.refreshExpiresAt?.toISOString() ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function loadTokens(socialAccountId: string): Promise<TokenSet | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("social_account_tokens").select("*").eq("social_account_id", socialAccountId).maybeSingle();
  if (!data) return null;
  return {
    accessToken: decryptToken(data.access_token_enc),
    refreshToken: data.refresh_token_enc ? decryptToken(data.refresh_token_enc) : undefined,
    accessExpiresAt: data.access_expires_at ? new Date(data.access_expires_at) : undefined,
    refreshExpiresAt: data.refresh_expires_at ? new Date(data.refresh_expires_at) : undefined,
    grantedScopes: [],
  };
}
