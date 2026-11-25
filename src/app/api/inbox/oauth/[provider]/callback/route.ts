import { NextResponse, type NextRequest } from "next/server";
import { inngest } from "@/inngest/client";
import { appUrl } from "@/lib/env";
import { InboxError } from "@/lib/inbox/config";
import { upsertConnection } from "@/lib/inbox/connections";
import { INBOX_COOKIE_PATH, inboxStateCookie, readInboxState } from "@/lib/inbox/oauth-state";
import { GMAIL_SCOPES, gmailExchange, gmailProfile, gmailRevoke } from "@/lib/inbox/providers/gmail";
import { connectInstagramFacebook } from "@/lib/inbox/instagram-facebook";
import { activateIgLoginInbox } from "@/lib/inbox/instagram-activate";
import { outlookExchange } from "@/lib/inbox/providers/outlook";
import { IG_PUBLISH_SCOPES, IG_SCOPE_MESSAGES, instagramLoginEnabled, isInstagramLogin } from "@/lib/social/instagram-login";
import { igLoginExchange, igLoginMe } from "@/lib/social/platforms/instagram";
import { saveTokens } from "@/lib/social/token-store";
import { PlatformError } from "@/lib/social/types";
import type { InboxChannel } from "@/lib/supabase/types/inbox";
import { createClient } from "@/lib/supabase/server";

const PROVIDERS: InboxChannel[] = ["gmail", "outlook", "instagram"];

/** Vuelta del OAuth de la bandeja: valida estado (anti-CSRF) y PKCE, guarda la conexión y los tokens cifrados. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const channel = provider as InboxChannel;
  const saved = readInboxState(request.cookies.get(inboxStateCookie(provider))?.value);
  const sp = request.nextUrl.searchParams;

  const finish = (q: string) => {
    const target = saved ? `/app/p/${saved.projectId}/inbox?${q}` : `/app?${q}`;
    const res = NextResponse.redirect(new URL(target, request.url));
    res.cookies.set(inboxStateCookie(provider), "", { path: INBOX_COOKIE_PATH, maxAge: 0 });
    return res;
  };

  if (!PROVIDERS.includes(channel) || !saved || sp.get("state") !== saved.state) return finish("error=invalid_state");
  if (sp.get("error")) return finish("error=denied");
  const code = sp.get("code");
  if (!code) return finish("error=invalid_state");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login", request.url));
  const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", saved.projectId).maybeSingle();
  if (!project) return finish("error=forbidden");
  const { data: ok } = await supabase.rpc("has_workspace_role", { p_workspace_id: project.workspace_id, p_min_role: "editor" });
  if (!ok) return finish("error=forbidden");

  const redirectUri = `${appUrl()}/api/inbox/oauth/${channel}/callback`;
  const base = { workspaceId: project.workspace_id, projectId: saved.projectId, userId: auth.user.id };
  try {
    let connectionId: string;
    if (channel === "gmail") {
      const t = await gmailExchange(code, redirectUri, saved.verifier);
      if (!GMAIL_SCOPES.every((s) => t.grantedScopes.includes(s))) {
        await gmailRevoke(t.refreshToken ?? t.accessToken);
        return finish("error=missing_scopes");
      }
      const { email } = await gmailProfile(t.accessToken);
      connectionId = await upsertConnection({ ...base, channel, externalId: email, displayName: email, grantedScopes: t.grantedScopes, tokens: t });
    } else if (channel === "outlook") {
      const t = await outlookExchange(code, redirectUri, saved.verifier);
      const scopes = t.grantedScopes.map((s) => s.toLowerCase());
      if (!scopes.some((s) => s.endsWith("mail.read")) || !scopes.some((s) => s.endsWith("mail.send")) || !t.refreshToken) return finish("error=missing_scopes");
      if (!t.email) return finish("error=profile_failed");
      connectionId = await upsertConnection({ ...base, channel, externalId: t.email, displayName: t.email, grantedScopes: t.grantedScopes, tokens: t });
    } else if (instagramLoginEnabled()) {
      // Instagram API with Instagram Login (sin página de Facebook).
      const { data: acc } = await supabase
        .from("social_accounts")
        .select("id, external_id, handle, metadata")
        .eq("id", saved.accountId ?? "")
        .eq("project_id", saved.projectId)
        .eq("platform", "instagram")
        .maybeSingle();
      if (!acc) {
        console.error("[inbox-oauth] instagram: el proyecto no tiene esa cuenta de Instagram conectada");
        return finish("error=no_matching_account");
      }
      const t = await igLoginExchange(code, redirectUri);
      if (!t.grantedScopes.includes(IG_SCOPE_MESSAGES)) {
        console.error(`[inbox-oauth] instagram: falta el permiso ${IG_SCOPE_MESSAGES}`);
        return finish("error=missing_scopes");
      }
      const me = await igLoginMe(t.accessToken);
      if (me.externalId !== acc.external_id) {
        // Ha entrado con otra cuenta de Instagram distinta de la conectada en Cuentas.
        console.error("[inbox-oauth] instagram: la cuenta autorizada no es la conectada en Cuentas");
        return finish("error=no_matching_account");
      }
      connectionId = await activateIgLoginInbox({
        ...base,
        account: { id: acc.id, external_id: acc.external_id, handle: me.handle ?? acc.handle },
        token: t,
        grantedScopes: t.grantedScopes,
      });
      // Si la cuenta de Cuentas también es de Instagram Login, se queda con este token (incluye el permiso de mensajes).
      // Misma función que el alta en Cuentas (comprueba rol con la sesión del usuario); solo actualiza esa cuenta.
      if (isInstagramLogin(acc.metadata)) {
        const { data: accountId, error } = await supabase.rpc("upsert_social_account", {
          p_project_id: saved.projectId,
          p_platform: "instagram",
          p_external_id: me.externalId,
          p_handle: me.handle ?? "",
          p_display_name: me.displayName ?? "",
          p_avatar_url: me.avatarUrl ?? "",
          p_granted_scopes: t.grantedScopes,
          p_missing_scopes: IG_PUBLISH_SCOPES.filter((s) => !t.grantedScopes.includes(s)),
          p_metadata: (me.metadata ?? {}) as never,
        });
        if (!error && accountId === acc.id) await saveTokens(acc.id, t).catch(() => undefined);
      }
    } else {
      const { data: acc } = await supabase
        .from("social_accounts")
        .select("id, external_id, handle")
        .eq("id", saved.accountId ?? "")
        .eq("project_id", saved.projectId)
        .eq("platform", "instagram")
        .maybeSingle();
      if (!acc) {
        console.error("[inbox-oauth] instagram: el proyecto no tiene esa cuenta de Instagram conectada");
        return finish("error=no_matching_account");
      }
      // Facebook Login for Business: Unified Login (token BISU, sin página) o Facebook Login clásico (token de página).
      const r = await connectInstagramFacebook({ ...base, code, redirectUri, account: acc });
      if (!r.ok) return finish(`error=${r.error}`);
      connectionId = r.connectionId;
    }
    // Primera sincronización en segundo plano (el evento solo lleva el id).
    await inngest.send({ name: "inbox/connection.sync", data: { connectionId } }).catch(() => undefined);
    return finish(`connected=${channel}`);
  } catch (e) {
    // PlatformError (Instagram Login) lleva "código:detalle": a la URL solo va el código; el detalle ya se registró.
    const code = e instanceof InboxError ? e.code : e instanceof PlatformError ? e.code.split(":")[0] : "unknown";
    console.error(`[inbox-oauth] ${channel} falló: ${code}`);
    return finish(`error=${encodeURIComponent(code)}`);
  }
}

