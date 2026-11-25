import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/env";
import { channelConfigured } from "@/lib/inbox/config";
import { INBOX_COOKIE_PATH, inboxStateCookie, newInboxState } from "@/lib/inbox/oauth-state";
import { gmailAuthorizeUrl } from "@/lib/inbox/providers/gmail";
import { igAuthorizeUrl } from "@/lib/inbox/providers/instagram";
import { outlookAuthorizeUrl } from "@/lib/inbox/providers/outlook";
import { buildIgAuthorizeUrl, IG_LOGIN_SCOPES, instagramLoginEnabled } from "@/lib/social/instagram-login";
import type { InboxChannel } from "@/lib/supabase/types/inbox";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
const PROVIDERS: InboxChannel[] = ["gmail", "outlook", "instagram"];

/** Inicia el OAuth OFICIAL (Google, Microsoft, Instagram Login o Facebook Login) para conectar un buzón/cuenta a la bandeja de un proyecto. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const sp = request.nextUrl.searchParams;
  const projectId = sp.get("project") ?? "";
  const accountId = sp.get("account") ?? undefined;
  if (!PROVIDERS.includes(provider as InboxChannel) || !UUID.test(projectId)) return NextResponse.redirect(new URL("/app", request.url));
  const back = (q: string) => NextResponse.redirect(new URL(`/app/p/${projectId}/inbox?${q}`, request.url));
  const channel = provider as InboxChannel;
  if (!channelConfigured(channel)) return back("error=not_configured");

  // El usuario debe poder editar el proyecto (RLS + rol).
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login", request.url));
  const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", projectId).maybeSingle();
  if (!project) return back("error=forbidden");
  const { data: ok } = await supabase.rpc("has_workspace_role", { p_workspace_id: project.workspace_id, p_min_role: "editor" });
  if (!ok) return back("error=forbidden");

  // Instagram: solo cuentas ya conectadas en "Cuentas" de este proyecto (minimización: no enlazamos otras).
  if (channel === "instagram") {
    if (!accountId || !UUID.test(accountId)) return back("error=no_matching_account");
    const { data: acc } = await supabase.from("social_accounts").select("id").eq("id", accountId).eq("project_id", projectId).eq("platform", "instagram").maybeSingle();
    if (!acc) return back("error=no_matching_account");
  }

  const { value, challenge, cookie } = newInboxState(projectId, channel === "instagram" ? accountId : undefined);
  const redirectUri = `${appUrl()}/api/inbox/oauth/${channel}/callback`;
  const url =
    channel === "gmail"
      ? gmailAuthorizeUrl({ state: value.state, redirectUri, codeChallenge: challenge })
      : channel === "outlook"
        ? outlookAuthorizeUrl({ state: value.state, redirectUri, codeChallenge: challenge })
        : instagramLoginEnabled()
          ? // Instagram Login: se piden los mismos permisos que en Cuentas (publicar + mensajes) para que el token nuevo
            // sirva para todo y no reduzca lo ya concedido; el que hace falta aquí es instagram_business_manage_messages.
            buildIgAuthorizeUrl({ clientId: process.env.INSTAGRAM_APP_ID ?? "", redirectUri, state: value.state, scopes: IG_LOGIN_SCOPES })
          : igAuthorizeUrl({ state: value.state, redirectUri });
  const res = NextResponse.redirect(url);
  res.cookies.set(inboxStateCookie(channel), cookie, { httpOnly: true, secure: true, sameSite: "lax", path: INBOX_COOKIE_PATH, maxAge: 600 });
  return res;
}
