import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/env";
import { getAdapter, missingScopes } from "@/lib/social";
import { readState, stateCookie } from "@/lib/social/oauth-state";
import { saveTokens } from "@/lib/social/token-store";
import { PlatformError } from "@/lib/social/types";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";

/** Vuelta del OAuth: valida el estado (anti-CSRF), obtiene tokens, guarda la cuenta y los tokens cifrados. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const adapter = getAdapter(platform);
  const saved = readState(request.cookies.get(stateCookie(platform))?.value);
  const sp = request.nextUrl.searchParams;

  const finish = (q: string) => {
    const target = saved ? `/app/p/${saved.projectId}/accounts?${q}` : `/app?${q}`;
    const res = NextResponse.redirect(new URL(target, request.url));
    res.cookies.set(stateCookie(platform), "", { path: "/api/oauth", maxAge: 0 });
    return res;
  };

  if (!adapter || !saved || sp.get("state") !== saved.state) return finish("error=invalid_state");
  if (sp.get("error")) return finish("error=denied"); // el usuario canceló en la plataforma
  const code = sp.get("code");
  if (!code) return finish("error=invalid_state");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login", request.url));

  try {
    const tokens = await adapter.exchangeCode({
      code,
      redirectUri: `${appUrl()}/api/oauth/${platform}/callback`,
      codeVerifier: saved.verifier,
    });
    const missing = missingScopes(adapter, tokens.grantedScopes);
    const profiles = await adapter.fetchProfiles(tokens);

    let connected = 0;
    for (const p of profiles) {
      // Alta con la sesión del usuario: la función comprueba rol y límite del plan.
      const { data: accountId, error } = await supabase.rpc("upsert_social_account", {
        p_project_id: saved.projectId,
        p_platform: adapter.id,
        p_external_id: p.externalId,
        p_handle: p.handle ?? "",
        p_display_name: p.displayName ?? "",
        p_avatar_url: p.avatarUrl ?? "",
        p_granted_scopes: tokens.grantedScopes,
        p_missing_scopes: missing,
        p_metadata: (p.metadata ?? {}) as never,
      });
      if (error) {
        const msg = error.message.includes("plan_limit_accounts") ? "plan_limit_accounts" : "forbidden";
        return finish(`error=${msg}`);
      }
      await saveTokens(accountId, p.tokens ?? tokens);
      connected++;
    }
    // Primeras estadísticas al momento (sin esperar al ciclo de 6 h).
    if (connected) await inngest.send({ name: "social/metrics.refresh", data: { projectId: saved.projectId } }).catch(() => undefined);
    return finish(`connected=${connected}${missing.length ? "&missing=1" : ""}`);
  } catch (e) {
    const code = e instanceof PlatformError ? e.code : "unknown";
    console.error(`[oauth] ${platform} falló: ${code}`);
    return finish(`error=${encodeURIComponent(code)}`);
  }
}
