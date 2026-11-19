import { NextResponse, type NextRequest } from "next/server";
import { isCryptoConfigured } from "@/lib/crypto/tokens";
import { appUrl } from "@/lib/env";
import { getAdapter } from "@/lib/social";
import { newState, stateCookie } from "@/lib/social/oauth-state";
import { createClient } from "@/lib/supabase/server";

/** Inicia el OAuth OFICIAL de la plataforma para vincular una cuenta a un proyecto. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const projectId = request.nextUrl.searchParams.get("project") ?? "";
  const back = (q: string) => NextResponse.redirect(new URL(`/app/p/${projectId}/accounts?${q}`, request.url));

  const adapter = getAdapter(platform);
  if (!adapter || !/^[0-9a-f-]{36}$/i.test(projectId)) return NextResponse.redirect(new URL("/app", request.url));
  if (!adapter.isConfigured() || !isCryptoConfigured() || !process.env.SUPABASE_SECRET_KEY) return back("error=not_configured");

  // El usuario debe poder editar el proyecto (RLS + rol).
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login", request.url));
  const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", projectId).maybeSingle();
  if (!project) return back("error=forbidden");
  const { data: ok } = await supabase.rpc("has_workspace_role", { p_workspace_id: project.workspace_id, p_min_role: "editor" });
  if (!ok) return back("error=forbidden");

  const { value, challenge, cookie } = newState(projectId, adapter.usesPkce);
  const url = adapter.authorizeUrl({ state: value.state, redirectUri: `${appUrl()}/api/oauth/${platform}/callback`, codeChallenge: challenge });
  const res = NextResponse.redirect(url);
  res.cookies.set(stateCookie(platform), cookie, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/oauth", maxAge: 600 });
  return res;
}
