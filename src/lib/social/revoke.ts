import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter } from ".";
import { loadTokens } from "./token-store";

/**
 * Revoca en cada plataforma los tokens OAuth de las cuentas sociales de estos workspaces
 * antes de borrarlos (derecho de supresión + términos de Meta/TikTok/Google).
 * Best-effort: si una plataforma falla, seguimos (el token se borra igualmente de nuestra base de datos).
 */
export async function revokeAllForWorkspaces(workspaceIds: string[]): Promise<void> {
  if (!workspaceIds.length) return;
  const admin = createAdminClient();
  if (!admin) return;
  const { data: accounts } = await admin.from("social_accounts").select("id, platform").in("workspace_id", workspaceIds);
  for (const a of accounts ?? []) await revokeAccount(a.id, a.platform);
}

export async function revokeAccount(socialAccountId: string, platform: string) {
  const adapter = getAdapter(platform);
  try {
    const tokens = await loadTokens(socialAccountId);
    if (adapter && tokens) await adapter.revoke(tokens.accessToken);
  } catch {
    console.error(`[social] No se pudo revocar en ${platform}`);
  }
}
