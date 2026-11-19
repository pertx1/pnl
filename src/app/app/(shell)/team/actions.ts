"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentWorkspace, getUser, WORKSPACE_COOKIE } from "@/lib/server/dal";
import { invitationUrl, sendInvitationEmail } from "@/lib/team/invitations";
import { teamErrorKey, type TeamError } from "@/lib/team/roles";
import { createClient } from "@/lib/supabase/server";

type TeamActionState = { ok?: boolean; error?: TeamError; link?: string; email?: string } | undefined;

const roleSchema = z.enum(["viewer", "editor", "admin"]);

/** Invitar por email (admin+). Los permisos y el límite del plan los comprueba create_invitation en la base de datos. */
export async function inviteMember(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const parsed = z
    .object({ email: z.email().max(254), role: roleSchema })
    .safeParse({ email: String(formData.get("email") ?? "").trim(), role: formData.get("role") });
  if (!parsed.success) return { error: "invalid_input" };

  const workspace = await getCurrentWorkspace();
  const user = await getUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invitation", {
    p_workspace_id: workspace.id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error || !data?.[0]) return { error: teamErrorKey(error) };

  const { data: profile } = user ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : { data: null };
  const sent = await sendInvitationEmail({
    to: parsed.data.email,
    token: data[0].token,
    workspaceName: workspace.name,
    inviterName: profile?.full_name || user?.email || "Kreo",
    role: parsed.data.role,
  });
  revalidatePath("/app/team");
  // Si el email no sale (proveedor sin configurar), el admin puede copiar el enlace y enviarlo él mismo.
  if (!sent.ok) return { ok: true, error: "email_failed", link: invitationUrl(data[0].token), email: parsed.data.email };
  return { ok: true, email: parsed.data.email };
}

export async function revokeInvitation(invitationId: string): Promise<TeamActionState> {
  if (!z.uuid().safeParse(invitationId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation_id: invitationId });
  if (error) return { error: teamErrorKey(error) };
  revalidatePath("/app/team");
  return { ok: true };
}

export async function changeMemberRole(userId: string, role: string): Promise<TeamActionState> {
  const parsed = z.object({ userId: z.uuid(), role: roleSchema }).safeParse({ userId, role });
  if (!parsed.success) return { error: "invalid_input" };
  const workspace = await getCurrentWorkspace();
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_member_role", { p_workspace_id: workspace.id, p_user_id: parsed.data.userId, p_role: parsed.data.role });
  if (error) return { error: teamErrorKey(error) };
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function removeMember(userId: string): Promise<TeamActionState> {
  if (!z.uuid().safeParse(userId).success) return { error: "invalid_input" };
  const workspace = await getCurrentWorkspace();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { p_workspace_id: workspace.id, p_user_id: userId });
  if (error) return { error: teamErrorKey(error) };
  revalidatePath("/app/team");
  return { ok: true };
}

export async function transferOwnership(userId: string): Promise<TeamActionState> {
  if (!z.uuid().safeParse(userId).success) return { error: "invalid_input" };
  const workspace = await getCurrentWorkspace();
  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_ownership", { p_workspace_id: workspace.id, p_user_id: userId });
  if (error) return { error: teamErrorKey(error) };
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function leaveWorkspace(): Promise<TeamActionState> {
  const workspace = await getCurrentWorkspace();
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_workspace", { p_workspace_id: workspace.id });
  if (error) return { error: teamErrorKey(error) };
  (await cookies()).delete(WORKSPACE_COOKIE);
  revalidatePath("/app", "layout");
  redirect("/app");
}
