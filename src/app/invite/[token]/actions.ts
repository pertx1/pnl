"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WORKSPACE_COOKIE } from "@/lib/server/dal";
import { isValidInviteToken, teamErrorKey, type TeamError } from "@/lib/team/roles";
import { createClient } from "@/lib/supabase/server";

/** Aceptar una invitación. La base de datos comprueba token, caducidad, email y plazas del plan. */
export async function acceptInvitation(_prev: { error?: TeamError } | undefined, formData: FormData): Promise<{ error?: TeamError } | undefined> {
  const token = String(formData.get("token") ?? "");
  if (!isValidInviteToken(token)) return { error: "invitation_invalid" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(`/app/team/accept/${token}`)}`);
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error || !data) return { error: teamErrorKey(error) };
  (await cookies()).set(WORKSPACE_COOKIE, data, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  revalidatePath("/app", "layout");
  redirect("/app");
}
