"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TIKTOK_PRIVACY, validateTarget, YT_CATEGORIES, YT_LANGUAGES, type MediaKind, type PlatformOptions, type RuleViolation } from "@/lib/posts/rules";
import { toErrorKey } from "@/lib/server/errors";
import { createClient } from "@/lib/supabase/server";

export type PostActionResult =
  | { ok: true; postId?: string; status?: string }
  | { ok?: false; error: string; violations?: { accountId: string; rules: RuleViolation[] }[]; limits?: { handle: string | null; planned: number; limit: number }[] };

const optionsSchema = z
  .object({
    privacy_level: z.enum(TIKTOK_PRIVACY as [string, ...string[]]).optional(),
    disable_comment: z.boolean().optional(),
    disable_duet: z.boolean().optional(),
    disable_stitch: z.boolean().optional(),
    brand_organic_toggle: z.boolean().optional(),
    brand_content_toggle: z.boolean().optional(),
    ig_trial_reel: z.enum(["manual", "auto"]).optional(),
    yt_title: z.string().trim().max(100).optional(),
    yt_privacy: z.enum(["public", "unlisted", "private"]).optional(),
    yt_made_for_kids: z.boolean().optional(),
    yt_tags: z.array(z.string().trim().min(1).max(100)).max(40).optional(),
    yt_category_id: z.enum(YT_CATEGORIES).optional(),
    yt_thumbnail_asset_id: z.uuid().optional(),
    yt_playlist_id: z.string().regex(/^[A-Za-z0-9_-]{10,64}$/).optional(),
    yt_notify_subscribers: z.boolean().optional(),
    yt_embeddable: z.boolean().optional(),
    yt_license: z.enum(["youtube", "creativeCommon"]).optional(),
    yt_language: z.enum(YT_LANGUAGES).optional(),
  })
  .strict();

const saveSchema = z.object({
  projectId: z.uuid(),
  postId: z.uuid().optional(),
  title: z.string().trim().max(120).optional(),
  caption: z.string().max(5000),
  scheduledAt: z.iso.datetime({ offset: true }).nullable(),
  aiGenerated: z.boolean(),
  assetIds: z.array(z.uuid()).max(10),
  targets: z
    .array(z.object({ socialAccountId: z.uuid(), captionOverride: z.string().max(5000).nullable(), platformOptions: optionsSchema }))
    .max(20),
});
export type SavePostInput = z.input<typeof saveSchema>;

function revalidate(projectId: string) {
  revalidatePath(`/app/p/${projectId}/calendar`);
  revalidatePath("/app/calendar");
}

export async function savePost(input: SavePostInput): Promise<PostActionResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "forbidden" };

  const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", d.projectId).maybeSingle();
  if (!project) return { error: "not_found" };

  // Etiqueta IA: obligatoria si algún asset es generado con IA (no se puede desactivar en ese caso).
  let aiGenerated = d.aiGenerated;
  if (d.assetIds.length) {
    const { data: assets } = await supabase.from("assets").select("id, ai_generated").in("id", d.assetIds).eq("project_id", d.projectId);
    if ((assets ?? []).length !== d.assetIds.length) return { error: "invalid_input" };
    if (assets!.some((a) => a.ai_generated)) aiGenerated = true;
  }

  let postId = d.postId;
  const values = {
    title: d.title || null,
    caption: d.caption,
    scheduled_at: d.scheduledAt,
    ai_generated: aiGenerated,
    asset_ids: d.assetIds,
  };
  if (postId) {
    const { data, error } = await supabase.from("posts").update(values).eq("id", postId).eq("project_id", d.projectId).select("id");
    if (error) return { error: toErrorKey(error) === "forbidden" ? "forbidden" : error.message.includes("post_locked") ? "post_locked" : "generic" };
    if (!data?.length) return { error: "forbidden" };
  } else {
    const { data, error } = await supabase
      .from("posts")
      .insert({ ...values, workspace_id: project.workspace_id, project_id: d.projectId, created_by: auth.user.id })
      .select("id")
      .single();
    if (error) return { error: toErrorKey(error) };
    postId = data.id;
  }

  // Sincronizar destinos (cuentas). Las cuentas deben pertenecer al mismo proyecto (lo comprueba un trigger).
  const { data: existing } = await supabase.from("post_targets").select("id, social_account_id").eq("post_id", postId!);
  const wanted = new Map(d.targets.map((t) => [t.socialAccountId, t]));
  const toDelete = (existing ?? []).filter((e) => !wanted.has(e.social_account_id)).map((e) => e.id);
  if (toDelete.length) await supabase.from("post_targets").delete().in("id", toDelete);
  for (const t of d.targets) {
    const ex = existing?.find((e) => e.social_account_id === t.socialAccountId);
    const row = { caption_override: t.captionOverride?.trim() ? t.captionOverride : null, platform_options: t.platformOptions };
    const res = ex
      ? await supabase.from("post_targets").update(row).eq("id", ex.id)
      : await supabase.from("post_targets").insert({ ...row, post_id: postId!, workspace_id: project.workspace_id, social_account_id: t.socialAccountId });
    if (res.error) return { error: toErrorKey(res.error) };
  }

  revalidate(d.projectId);
  return { ok: true, postId };
}

/** Comprueba las reglas de cada red antes de enviar o aprobar. */
async function checkRules(supabase: Awaited<ReturnType<typeof createClient>>, postId: string) {
  const { data: post } = await supabase.from("posts").select("caption, asset_ids").eq("id", postId).maybeSingle();
  if (!post) return { error: "not_found" as const };
  const { data: targets } = await supabase
    .from("post_targets")
    .select("social_account_id, caption_override, platform_options, social_accounts(platform)")
    .eq("post_id", postId);
  const { data: assets } = post.asset_ids.length ? await supabase.from("assets").select("mime_type").in("id", post.asset_ids) : { data: [] };
  const media: MediaKind[] = (assets ?? []).map((a) => (a.mime_type.startsWith("video/") ? "video" : "image"));
  const violations = (targets ?? [])
    .map((t) => ({
      accountId: t.social_account_id,
      rules: validateTarget(t.social_accounts?.platform ?? "", t.caption_override ?? post.caption, media, (t.platform_options ?? {}) as PlatformOptions),
    }))
    .filter((v) => v.rules.length);
  return { violations };
}

function mapRpcError(message: string) {
  for (const k of ["daily_limit_exceeded", "no_targets", "scheduled_in_past", "account_not_active", "forbidden"]) if (message.includes(k)) return k;
  return "generic";
}

export async function submitPost(projectId: string, postId: string): Promise<PostActionResult> {
  if (!z.uuid().safeParse(postId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const rules = await checkRules(supabase, postId);
  if ("error" in rules) return { error: rules.error! };
  if (rules.violations.length) return { error: "rules", violations: rules.violations };
  const { error } = await supabase.rpc("submit_post", { p_post_id: postId });
  if (error) return { error: mapRpcError(error.message) };
  revalidate(projectId);
  return { ok: true, status: "pending_approval" };
}

/** Aprobación humana (admin). Es el ÚNICO camino hacia la publicación. */
export async function approvePost(projectId: string, postId: string): Promise<PostActionResult> {
  if (!z.uuid().safeParse(postId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const rules = await checkRules(supabase, postId);
  if ("error" in rules) return { error: rules.error! };
  if (rules.violations.length) return { error: "rules", violations: rules.violations };
  const { data, error } = await supabase.rpc("approve_post", { p_post_id: postId });
  if (error) {
    const key = mapRpcError(error.message);
    if (key === "daily_limit_exceeded") {
      const { data: lim } = await supabase.rpc("post_limit_violations", { p_post_id: postId });
      return { error: key, limits: (lim ?? []).map((l) => ({ handle: l.handle, planned: l.planned, limit: l.daily_limit })) };
    }
    return { error: key };
  }
  revalidate(projectId);
  return { ok: true, status: data };
}

export async function unschedulePost(projectId: string, postId: string, cancel = false): Promise<PostActionResult> {
  if (!z.uuid().safeParse(postId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("unschedule_post", { p_post_id: postId, p_cancel: cancel });
  if (error) return { error: mapRpcError(error.message) };
  revalidate(projectId);
  return { ok: true };
}

export async function deletePost(projectId: string, postId: string): Promise<PostActionResult> {
  if (!z.uuid().safeParse(postId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("posts").delete().eq("id", postId).select("id");
  if (error) return { error: toErrorKey(error) };
  if (!data?.length) return { error: "forbidden" };
  revalidate(projectId);
  return { ok: true };
}

/**
 * Reprogramar arrastrando en el calendario. Cambiar la fecha de un post programado lo devuelve a
 * "pendiente de aprobación"; si quien arrastra es admin, el propio arrastre cuenta como su aprobación
 * explícita y se vuelve a aprobar (con todas las comprobaciones anti-baneo).
 */
export async function reschedulePost(projectId: string, postId: string, scheduledAt: string): Promise<PostActionResult> {
  const parsed = z.object({ id: z.uuid(), at: z.iso.datetime({ offset: true }) }).safeParse({ id: postId, at: scheduledAt });
  if (!parsed.success) return { error: "invalid_input" };
  if (new Date(scheduledAt).getTime() < Date.now()) return { error: "scheduled_in_past" };
  const supabase = await createClient();
  const { data: before } = await supabase.from("posts").select("status, workspace_id").eq("id", postId).maybeSingle();
  if (!before) return { error: "not_found" };
  const { error } = await supabase.from("posts").update({ scheduled_at: scheduledAt }).eq("id", postId);
  if (error) return { error: error.message.includes("post_locked") ? "post_locked" : toErrorKey(error) };

  if (before.status === "scheduled" || before.status === "approved") {
    const { data: isAdmin } = await supabase.rpc("has_workspace_role", { p_workspace_id: before.workspace_id, p_min_role: "admin" });
    if (isAdmin) {
      const res = await approvePost(projectId, postId);
      if (!res.ok) {
        revalidate(projectId);
        return res;
      }
    }
  }
  revalidate(projectId);
  return { ok: true };
}

/** Registra en la biblioteca un archivo ya subido a `project-media/{ws}/{project}/...` desde el navegador. */
export async function addUploadedAsset(projectId: string, path: string, mime: string, size: number): Promise<PostActionResult & { assetId?: string }> {
  const parsed = z
    .object({
      projectId: z.uuid(),
      path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp|mp4|mov)$/),
      mime: z.enum(["image/png", "image/jpeg", "image/webp", "video/mp4", "video/quicktime"]),
      size: z.number().int().positive().max(50 * 1024 * 1024),
    })
    .safeParse({ projectId, path, mime, size });
  if (!parsed.success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", projectId).maybeSingle();
  if (!auth.user || !project || !path.startsWith(`${project.workspace_id}/${projectId}/`)) return { error: "forbidden" };
  const { data, error } = await supabase
    .from("assets")
    .insert({ workspace_id: project.workspace_id, project_id: projectId, storage_path: path, mime_type: mime, size_bytes: size, source: "upload", created_by: auth.user.id })
    .select("id")
    .single();
  if (error) return { error: toErrorKey(error) };
  return { ok: true, assetId: data.id };
}
