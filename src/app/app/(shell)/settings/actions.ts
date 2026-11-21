"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mfaPending as mfaPendingVerified, WORKSPACE_COOKIE } from "@/lib/server/dal";
import { keep, toErrorKey, type ActionState } from "@/lib/server/errors";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = keep(formData, ["full_name"]);
  const parsed = z.object({ full_name: z.string().trim().min(1).max(120) }).safeParse(values);
  if (!parsed.success) return { error: "invalid_input", values };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.full_name }).eq("id", auth.user.id);
  if (error) return { error: toErrorKey(error), values };
  revalidatePath("/app/settings");
  return { ok: true, values };
}

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ password: z.string().min(10).max(200) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "weak_password" };
  const supabase = await createClient();
  if (await mfaPending()) return { error: "forbidden" };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: toErrorKey(error) };
  return { ok: true };
}

/**
 * Borrado de cuenta (RGPD art. 17).
 * 1) Comprueba que no es el único owner de workspaces con más miembros.
 * 2) Borra los archivos de Storage de sus workspaces en solitario (Postgres no puede borrar archivos).
 * 3) Revoca en cada plataforma los tokens OAuth de las cuentas sociales de esos workspaces.
 * 4) Borra usuario y workspaces en cascada (función SQL) y cierra sesión.
 */
export async function deleteAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  // Las server actions no pasan por el layout que exige aal2: si tiene 2FA, la sesión debe estar verificada.
  if (await mfaPending()) return { error: "forbidden" };

  const confirmEmail = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (confirmEmail !== (auth.user.email ?? "").toLowerCase()) return { error: "invalid_input", message: "mismatch" };

  const { data: blocking, error: blockErr } = await supabase.rpc("my_blocking_workspaces");
  if (blockErr) return { error: toErrorKey(blockErr) };
  if (blocking?.length) return { error: "transfer_ownership_required", message: blocking.map((b) => b.name).join(", ") };

  const { data: solo, error: soloErr } = await supabase.rpc("my_solo_workspaces");
  if (soloErr) return { error: toErrorKey(soloErr) };

  for (const wsId of solo ?? []) {
    await removeFolder(supabase, "brand-assets", wsId);
    await removeFolder(supabase, "project-media", wsId); // subidas y generaciones de IA
  }

  // Revocación de tokens OAuth en cada plataforma ANTES de borrar (la cascada solo los borra de nuestra base de datos).
  const { revokeAllForWorkspaces } = await import("@/lib/social/revoke");
  await revokeAllForWorkspaces(solo ?? []);

  const { error } = await supabase.rpc("delete_my_account");
  if (error) return { error: toErrorKey(error) };

  await supabase.auth.signOut();
  (await cookies()).delete(WORKSPACE_COOKIE);
  redirect("/?account=deleted");
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** true si el usuario tiene 2FA activada pero esta sesión aún no ha verificado el código (aal1). */
async function mfaPending() {
  return mfaPendingVerified();
}

/** Borra recursivamente todos los objetos bajo `prefix` en un bucket (con la sesión del usuario → RLS). */
async function removeFolder(supabase: Client, bucket: string, prefix: string) {
  const { data: entries } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (!entries?.length) return;
  const files: string[] = [];
  for (const e of entries) {
    const path = `${prefix}/${e.name}`;
    if (e.id === null) await removeFolder(supabase, bucket, path); // carpeta
    else files.push(path);
  }
  if (files.length) await supabase.storage.from(bucket).remove(files);
}
