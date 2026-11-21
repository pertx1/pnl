import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceRoleT } from "@/lib/supabase/database.types";

/**
 * Capa de acceso a datos (DAL). Todas las lecturas pasan por aquí con la sesión del usuario,
 * así que la base de datos aplica RLS. Nunca usar la service key para datos de usuario.
 */

export const WORKSPACE_COOKIE = "kreo_ws";

export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

/**
 * ¿Tiene el usuario 2FA activada y esta sesión aún no ha verificado el código?
 * Usa datos verificados: el nivel (aal) sale del JWT validado con getClaims() y los factores del usuario de getUser().
 * (getAuthenticatorAssuranceLevel() lee la sesión de la cookie sin verificarla y Supabase lo avisa en los logs.)
 */
export const mfaPending = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const [{ data: claims }, user] = await Promise.all([supabase.auth.getClaims(), getUser()]);
  const hasVerifiedFactor = (user?.factors ?? []).some((f) => f.status === "verified");
  return hasVerifiedFactor && claims?.claims?.aal !== "aal2";
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export type WorkspaceSummary = { id: string; name: string; role: WorkspaceRoleT; planId: string };

export const getWorkspaces = cache(async (): Promise<WorkspaceSummary[]> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspaces!inner(id, name, plan_id)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.workspaces.id,
    name: m.workspaces.name,
    planId: m.workspaces.plan_id,
    role: m.role,
  }));
});

/** Workspace activo: el de la cookie si el usuario es miembro; si no, el primero. Redirige a onboarding si no tiene. */
export const getCurrentWorkspace = cache(async (): Promise<WorkspaceSummary> => {
  const workspaces = await getWorkspaces();
  if (workspaces.length === 0) redirect("/app/onboarding");
  const preferred = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  return workspaces.find((w) => w.id === preferred) ?? workspaces[0];
});

export const getPlan = cache(async (planId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("plans").select("*").eq("id", planId).single();
  if (error) throw error;
  return data;
});

export const getCreditBalance = cache(async (workspaceId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("credit_balances").select("balance").eq("workspace_id", workspaceId).maybeSingle();
  return data?.balance ?? 0;
});

export const getProjects = cache(async (workspaceId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, description, created_at")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
});

/** Proyecto + rol del usuario en su workspace. 404 si no existe o no tiene acceso (RLS). */
export const getProject = cache(async (projectId: string) => {
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(projectId)) notFound();
  const workspaces = await getWorkspaces();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, description, workspace_id, created_at")
    .eq("id", projectId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  const ws = workspaces.find((w) => w.id === data.workspace_id);
  if (!ws) notFound();
  return { ...data, workspace: ws };
});

export const getBrandKit = cache(async (projectId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("brand_kits").select("*").eq("project_id", projectId).single();
  if (error) throw error;
  return data;
});

const ROLE_ORDER: WorkspaceRoleT[] = ["viewer", "editor", "admin", "owner"];
export function roleAtLeast(role: WorkspaceRoleT, min: WorkspaceRoleT) {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(min);
}
