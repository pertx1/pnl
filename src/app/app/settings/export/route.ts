import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Exportación de datos personales (RGPD art. 15 y 20). Solo lo que RLS permite ver al propio usuario. */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const uid = auth.user.id;

  const [profile, memberships, workspaces, projects, brandKits, ledger] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
    supabase.from("workspace_members").select("workspace_id, role, created_at").eq("user_id", uid),
    supabase.from("workspaces").select("id, name, plan_id, created_at"),
    supabase.from("projects").select("id, workspace_id, name, description, created_at, archived_at"),
    supabase.from("brand_kits").select("*"),
    supabase.from("credit_ledger").select("workspace_id, delta, balance_after, reason, ref_type, ref_id, created_at"),
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
  };

  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="kreo-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
