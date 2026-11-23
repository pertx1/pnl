"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { buildRedirect, generateToken, hashToken } from "@/lib/mcp/oauth";
import { issuer } from "@/lib/mcp/oauth-server";
import { getUser, mfaPending } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";
import { clearPendingRequest, readPendingRequest } from "./pending";

export type ConsentResult = { error: "expired" | "login" | "forbidden" | "invalid_input" };

/**
 * "Permitir": crea un código de autorización de un solo uso (5 min, solo su hash en BD) ligado a usuario + workspace +
 * cliente + redirect_uri + PKCE + recurso, y vuelve al cliente (Claude) con ?code&state&iss.
 * La función de BD vuelve a comprobar la sesión, la 2FA y que el usuario sea miembro del workspace.
 */
export async function approveConsent(workspaceId: string, digest: string): Promise<ConsentResult> {
  if (!z.uuid().safeParse(workspaceId).success || typeof digest !== "string") return { error: "invalid_input" };
  const pending = await readPendingRequest();
  if (!pending || pending.digest !== digest) return { error: "expired" };
  const user = await getUser();
  if (!user) return { error: "login" };
  if (await mfaPending()) return { error: "forbidden" };

  const code = generateToken("code");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mcp_oauth_create_code", {
    p_code_hash: hashToken(code),
    p_client_id: pending.params.clientId,
    p_workspace_id: workspaceId,
    p_redirect_uri: pending.params.redirectUri,
    p_code_challenge: pending.params.codeChallenge,
    p_scope: pending.params.scope,
    p_resource: pending.params.resource,
  });
  if (error) return { error: "forbidden" };
  await clearPendingRequest();
  redirect(buildRedirect(pending.params.redirectUri, { code, state: pending.params.state, iss: issuer() }));
}

/** "Cancelar": vuelve al cliente con error=access_denied (RFC 6749 §4.1.2.1). */
export async function denyConsent(digest: string): Promise<ConsentResult> {
  const pending = await readPendingRequest();
  await clearPendingRequest();
  if (!pending || pending.digest !== digest) redirect("/app/settings/api-keys");
  redirect(buildRedirect(pending.params.redirectUri, { error: "access_denied", state: pending.params.state, iss: issuer() }));
}
