"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toErrorKey, type ActionState } from "@/lib/server/errors";
import { revokeAccount } from "@/lib/social/revoke";
import { createClient } from "@/lib/supabase/server";

/** Desconectar: revoca el acceso en la plataforma y borra cuenta + tokens (cascada). Solo admin (RLS). */
export async function disconnectAccount(accountId: string): Promise<ActionState> {
  if (!z.uuid().safeParse(accountId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: acc } = await supabase.from("social_accounts").select("id, platform, project_id, workspace_id").eq("id", accountId).maybeSingle();
  if (!acc) return { error: "not_found" };
  const { data: isAdmin } = await supabase.rpc("has_workspace_role", { p_workspace_id: acc.workspace_id, p_min_role: "admin" });
  if (!isAdmin) return { error: "forbidden" };

  await revokeAccount(acc.id, acc.platform);
  const { error } = await supabase.from("social_accounts").delete().eq("id", accountId);
  if (error) return { error: toErrorKey(error) };
  revalidatePath(`/app/p/${acc.project_id}/accounts`);
  return { ok: true };
}

export async function updateDailyLimit(accountId: string, limit: number): Promise<ActionState> {
  const parsed = z.object({ id: z.uuid(), limit: z.number().int().min(1).max(25) }).safeParse({ id: accountId, limit });
  if (!parsed.success) return { error: "invalid_input" };
  const supabase = await createClient();
  // El CHECK de la base de datos impone el máximo por plataforma; RLS exige admin.
  const { data, error } = await supabase.from("social_accounts").update({ daily_post_limit: limit }).eq("id", accountId).select("project_id");
  if (error) return { error: error.code === "23514" ? "invalid_input" : toErrorKey(error) };
  if (!data?.length) return { error: "forbidden" };
  revalidatePath(`/app/p/${data[0].project_id}/accounts`);
  return { ok: true };
}
