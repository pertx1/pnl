import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { checkAuthorizeRequest, isLoopbackHost, redirectHost, type AuthorizeParams } from "@/lib/mcp/oauth";
import { AUTH_REQUEST_COOKIE, mcpResource, resolveClient, type ResolvedClient } from "@/lib/mcp/oauth-server";
import { createAdminClient } from "@/lib/supabase/admin";

export type PendingRequest = {
  params: AuthorizeParams;
  client: ResolvedClient;
  redirectHost: string;
  loopbackOnly: boolean;
  clientIdHost: string | null;
  /** Resumen de la petición mostrada: "Permitir" solo vale para ESTA petición aunque la cookie cambie en otra pestaña. */
  digest: string;
};

/**
 * Lee la petición de autorización pendiente de la cookie y la VUELVE a validar entera (cliente, redirect_uri, PKCE,
 * recurso): el contenido de la cookie no se da por bueno.
 */
export async function readPendingRequest(): Promise<PendingRequest | null> {
  const raw = (await cookies()).get(AUTH_REQUEST_COOKIE)?.value;
  if (!raw || raw.length > 6000) return null;
  let p: Partial<AuthorizeParams>;
  try {
    p = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<AuthorizeParams>;
  } catch {
    return null;
  }
  const db = createAdminClient();
  if (!db || typeof p.clientId !== "string") return null;
  const client = await resolveClient(db, p.clientId);
  const check = checkAuthorizeRequest(
    {
      client_id: p.clientId,
      redirect_uri: typeof p.redirectUri === "string" ? p.redirectUri : undefined,
      response_type: "code",
      code_challenge: typeof p.codeChallenge === "string" ? p.codeChallenge : undefined,
      code_challenge_method: "S256",
      state: typeof p.state === "string" ? p.state : undefined,
      scope: typeof p.scope === "string" ? p.scope : undefined,
      resource: typeof p.resource === "string" ? p.resource : undefined,
    },
    client?.redirectUris ?? null,
    mcpResource(),
  );
  if (!check.ok || !client) return null;
  let clientIdHost: string | null = null;
  if (client.kind === "cimd") clientIdHost = new URL(client.clientId).hostname;
  return {
    params: check.params,
    client,
    redirectHost: redirectHost(check.params.redirectUri),
    loopbackOnly: client.redirectUris.every((u) => {
      try {
        return isLoopbackHost(new URL(u).hostname);
      } catch {
        return false;
      }
    }),
    clientIdHost,
    digest: createHash("sha256").update(raw).digest("base64url"),
  };
}

export async function clearPendingRequest() {
  (await cookies()).delete(AUTH_REQUEST_COOKIE);
}
