import { NextResponse, type NextRequest } from "next/server";
import { inngest } from "@/inngest/client";
import { appUrl } from "@/lib/env";
import { InboxError } from "@/lib/inbox/config";
import { upsertConnection } from "@/lib/inbox/connections";
import { INBOX_COOKIE_PATH, inboxStateCookie, readInboxState } from "@/lib/inbox/oauth-state";
import { GMAIL_SCOPES, gmailExchange, gmailProfile, gmailRevoke } from "@/lib/inbox/providers/gmail";
import { igExchange, igPages, igSubscribePage, IG_INBOX_SCOPES } from "@/lib/inbox/providers/instagram";
import { outlookExchange } from "@/lib/inbox/providers/outlook";
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
    } else {
      const { data: acc } = await supabase
        .from("social_accounts")
        .select("id, external_id, handle")
        .eq("id", saved.accountId ?? "")
        .eq("project_id", saved.projectId)
        .eq("platform", "instagram")
        .maybeSingle();
      if (!acc) return finish("error=no_matching_account");
      const t = await igExchange(code, redirectUri);
      if (!IG_INBOX_SCOPES.every((s) => t.grantedScopes.includes(s))) return finish("error=missing_scopes");
      const page = (await igPages(t.accessToken)).find((p) => p.igId === acc.external_id);
      // No revocamos permisos aquí: es la misma app de Meta que usa el módulo de publicación.
      if (!page) return finish("error=no_matching_account");
      await igSubscribePage(page.pageId, page.pageToken);
      // Guardamos SOLO el token de la página (no caduca si procede de un token de usuario de larga duración).
      connectionId = await upsertConnection({
        ...base,
        channel,
        externalId: page.igId,
        displayName: page.username ? `@${page.username}` : (acc.handle ? `@${acc.handle}` : page.name),
        socialAccountId: acc.id,
        grantedScopes: t.grantedScopes,
        metadata: { page_id: page.pageId },
        tokens: { accessToken: page.pageToken },
      });
    }
    // Primera sincronización en segundo plano (el evento solo lleva el id).
    await inngest.send({ name: "inbox/connection.sync", data: { connectionId } }).catch(() => undefined);
    return finish(`connected=${channel}`);
  } catch (e) {
    const code = e instanceof InboxError ? e.code : "unknown";
    console.error(`[inbox-oauth] ${channel} falló: ${code}`);
    return finish(`error=${encodeURIComponent(code)}`);
  }
}
