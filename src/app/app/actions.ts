"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getWorkspaces, WORKSPACE_COOKIE } from "@/lib/server/dal";
import { keep, toErrorKey, type ActionState } from "@/lib/server/errors";
import { createClient } from "@/lib/supabase/server";

const cookieOpts = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const, httpOnly: true };

// ---------------------------------------------------------------- workspaces

const workspaceSchema = z.object({ name: z.string().trim().min(1).max(80) });

export async function createWorkspace(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = keep(formData, ["name"]);
  const parsed = workspaceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid_input", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_workspace", { p_name: parsed.data.name });
  if (error) return { error: toErrorKey(error), values };

  (await cookies()).set(WORKSPACE_COOKIE, data, cookieOpts);
  redirect("/app/projects/new");
}

export async function switchWorkspace(workspaceId: string) {
  const workspaces = await getWorkspaces();
  if (!workspaces.some((w) => w.id === workspaceId)) return;
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, cookieOpts);
  redirect("/app");
}

// ---------------------------------------------------------------- projects

const projectSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
});

export async function createProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = keep(formData, ["name", "description"]);
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid_input", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_project", {
    p_workspace_id: parsed.data.workspaceId,
    p_name: parsed.data.name,
    p_description: parsed.data.description || undefined,
  });
  if (error) return { error: toErrorKey(error), values };

  revalidatePath("/app", "layout");
  redirect(`/app/p/${data}`);
}

// ---------------------------------------------------------------- brand kit

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const brandKitSchema = z.object({
  projectId: z.uuid(),
  tone_of_voice: z.string().trim().max(2000),
  target_audience: z.string().trim().max(2000),
  banned_words: z.array(z.string().trim().min(1).max(60)).max(100),
  colors: z.array(z.object({ name: z.string().trim().max(40), hex })).max(12),
  fonts: z.array(z.object({ role: z.string().trim().max(40), family: z.string().trim().min(1).max(60) })).max(6),
  example_posts: z
    .array(z.object({ url: z.url({ protocol: /^https$/ }).max(500), note: z.string().trim().max(300) }))
    .max(20),
});

export type BrandKitInput = z.input<typeof brandKitSchema>;

export async function updateBrandKit(input: BrandKitInput): Promise<ActionState> {
  const parsed = brandKitSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input", fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const { projectId, ...values } = parsed.data;
  const supabase = await createClient();
  // RLS garantiza que solo editores o superiores del workspace pueden actualizar.
  const { data, error } = await supabase
    .from("brand_kits")
    .update({
      ...values,
      tone_of_voice: values.tone_of_voice || null,
      target_audience: values.target_audience || null,
    })
    .eq("project_id", projectId)
    .select("project_id");
  if (error) return { error: toErrorKey(error) };
  if (!data?.length) return { error: "forbidden" };

  revalidatePath(`/app/p/${projectId}/brand-kit`);
  return { ok: true };
}
