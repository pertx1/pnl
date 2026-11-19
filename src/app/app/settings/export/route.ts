import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Exportación de datos personales (RGPD art. 15 y 20). Solo lo que RLS permite ver al propio usuario. */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const uid = auth.user.id;

  const [profile, memberships, workspaces, projects, brandKits, ledger, socialAccounts, posts, postTargets, aiGenerations, assets] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
    supabase.from("workspace_members").select("workspace_id, role, created_at").eq("user_id", uid),
    supabase.from("workspaces").select("id, name, plan_id, created_at"),
    supabase.from("projects").select("id, workspace_id, name, description, created_at, archived_at"),
    supabase.from("brand_kits").select("*"),
    supabase.from("credit_ledger").select("workspace_id, delta, balance_after, reason, ref_type, ref_id, created_at"),
    // Cuentas sociales: solo datos de la conexión; los tokens están en otra tabla sin acceso para usuarios.
    supabase.from("social_accounts").select("id, project_id, platform, handle, display_name, status, granted_scopes, daily_post_limit, connected_by, created_at"),
    supabase.from("posts").select("id, project_id, title, caption, asset_ids, ai_generated, status, scheduled_at, created_by, approved_by, approved_at, created_at"),
    supabase.from("post_targets").select("id, post_id, social_account_id, caption_override, platform_options, status, external_url, published_at"),
    supabase.from("ai_generations").select("id, project_id, kind, provider, model, prompt, status, credits_cost, license, created_at").eq("created_by", uid),
    supabase.from("assets").select("id, project_id, storage_path, mime_type, size_bytes, source, ai_generated, created_at").eq("created_by", uid),
  ]);

  const body = {
    exported_at: new Date().toISOString(),
    account: {
      id: uid,
      email: auth.user.email,
      created_at: auth.user.created_at,
      last_sign_in_at: auth.user.last_sign_in_at,
      metadata: auth.user.user_metadata,
    },
    profile: profile.data,
    memberships: memberships.data ?? [],
    workspaces: workspaces.data ?? [],
    projects: projects.data ?? [],
    brand_kits: brandKits.data ?? [],
    credit_ledger: ledger.data ?? [],
    social_accounts: socialAccounts.data ?? [],
    posts: posts.data ?? [],
    post_targets: postTargets.data ?? [],
    ai_generations: aiGenerations.data ?? [],
    assets: assets.data ?? [],
  };

  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="kreo-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
