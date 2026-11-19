import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { evaluateLimit, type LimitKind, type LimitStatus } from "./limits";

export type WorkspaceUsage = {
  planId: string;
  planName: string;
  monthlyCredits: number;
  limits: Record<Exclude<LimitKind, "credits">, LimitStatus>;
  pendingInvites: number;
};

/**
 * Uso actual del workspace frente a los límites de su plan (con la sesión del usuario → RLS).
 * Reutilizable desde cualquier página: `const usage = await getWorkspaceUsage(workspace.id)`.
 */
export const getWorkspaceUsage = cache(async (workspaceId: string): Promise<WorkspaceUsage | null> => {
  const supabase = await createClient();
  const [{ data: ws }, projects, accounts, { data: capacity }] = await Promise.all([
    supabase.from("workspaces").select("plan_id, plans(name, max_projects, max_social_accounts, max_members, monthly_credits)").eq("id", workspaceId).maybeSingle(),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("archived_at", null),
    supabase.from("social_accounts").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase.rpc("workspace_member_capacity", { p_workspace_id: workspaceId }),
  ]);
  const plan = ws?.plans;
  if (!ws || !plan) return null;
  const cap = capacity?.[0];
  const members = cap?.members ?? 0;
  const pending = cap?.pending ?? 0;
  return {
    planId: ws.plan_id,
    planName: plan.name,
    monthlyCredits: plan.monthly_credits,
    pendingInvites: pending,
    limits: {
      projects: evaluateLimit("projects", projects.count ?? 0, plan.max_projects),
      socialAccounts: evaluateLimit("socialAccounts", accounts.count ?? 0, plan.max_social_accounts),
      // Las invitaciones pendientes ocupan plaza (igual que en create_invitation).
      members: evaluateLimit("members", members + pending, plan.max_members),
    },
  };
});

/** Comprobación previa en servidor (la definitiva la hace la base de datos). */
export async function assertWithinLimit(workspaceId: string, kind: Exclude<LimitKind, "credits">) {
  const usage = await getWorkspaceUsage(workspaceId);
  if (!usage) return { ok: false as const, reason: "not_found" as const };
  const status = usage.limits[kind];
  return status.reached ? { ok: false as const, reason: "limit" as const, status } : { ok: true as const, status };
}
