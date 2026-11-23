"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PLANNED_STATUSES } from "@/lib/mcp/calendar";
import { validateTarget, type PlatformOptions, type RuleViolation } from "@/lib/posts/rules";
import { platformOptionsSchema } from "@/lib/posts/schema";
import { applyDailyLimits, occurrenceRange, SERIES_MAX, SERIES_TZ, seriesOccurrences, valuesForOccurrence, type Weekday } from "@/lib/posts/series";
import { appendHashtags, extractPlaceholders, fillPlaceholders, optionsForPlatform, parseHashtags, templateOptionsFromTargets } from "@/lib/posts/templates";
import { toTemplateDTO } from "@/lib/server/templates";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type TemplateActionResult<T = undefined> = { ok: true; data: T } | { ok?: false; error: string };

const uuid = z.uuid();
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Proyecto + comprobación explícita de rol editor (además de RLS). */
async function editorContext(projectId: string) {
  if (!uuid.safeParse(projectId).success) return null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", projectId).is("archived_at", null).maybeSingle();
  if (!project) return null;
  const { data: isEditor } = await supabase.rpc("has_workspace_role", { p_workspace_id: project.workspace_id, p_min_role: "editor" });
  if (!isEditor) return null;
  return { supabase, userId: auth.user.id, workspaceId: project.workspace_id };
}

const dbError = (e: { code?: string; message?: string }) => (e.code === "23505" ? "duplicate_name" : e.code === "42P01" || e.code === "PGRST205" ? "not_configured" : e.code === "42501" ? "forbidden" : "generic");

function revalidate(projectId: string) {
  revalidatePath(`/app/p/${projectId}/templates`);
  revalidatePath(`/app/p/${projectId}/posts/new`);
}

// =============================================================================================== PLANTILLAS
const templateSchema = z.object({
  projectId: z.uuid(),
  templateId: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  title: z.string().trim().max(120),
  caption: z.string().max(5000),
  hashtags: z.array(z.string().max(101)).max(60),
  accountIds: z.array(z.uuid()).max(20),
  /** Opciones por red. Las de TikTok no se aceptan (sus normas: sin valores por defecto). */
  options: z.object({ youtube: platformOptionsSchema.optional() }).strict(),
  preferredTime: timeSchema.nullable(),
});
export type SaveTemplateInput = z.input<typeof templateSchema>;

export async function saveTemplate(input: SaveTemplateInput): Promise<TemplateActionResult<{ id: string }>> {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const c = await editorContext(d.projectId);
  if (!c) return { error: "forbidden" };

  const accountIds = [...new Set(d.accountIds)];
  const { data: accounts } = accountIds.length
    ? await c.supabase.from("social_accounts").select("id, platform").eq("project_id", d.projectId).in("id", accountIds)
    : { data: [] as { id: string; platform: string }[] };
  if ((accounts ?? []).length !== accountIds.length) return { error: "invalid_input" };
  const hashtags = parseHashtags(d.hashtags.join(" "));
  const options = templateOptionsFromTargets((accounts ?? []).map((a) => ({ platform: a.platform, options: a.platform === "youtube" ? ((d.options.youtube ?? {}) as PlatformOptions) : {} })));

  const values = {
    name: d.name,
    title: d.title || null,
    caption: d.caption,
    hashtags,
    social_account_ids: accountIds,
    platform_options: options as Json,
    preferred_time: d.preferredTime,
  };
  if (d.templateId) {
    const { data, error } = await c.supabase.from("post_templates").update(values).eq("id", d.templateId).eq("project_id", d.projectId).select("id");
    if (error) return { error: dbError(error) };
    if (!data?.length) return { error: "not_found" };
    revalidate(d.projectId);
    return { ok: true, data: { id: d.templateId } };
  }
  const { data, error } = await c.supabase
    .from("post_templates")
    .insert({ ...values, workspace_id: c.workspaceId, project_id: d.projectId, created_by: c.userId })
    .select("id")
    .single();
  if (error) return { error: dbError(error) };
  revalidate(d.projectId);
  return { ok: true, data: { id: data.id } };
}

export async function deleteTemplate(projectId: string, templateId: string): Promise<TemplateActionResult> {
  if (!uuid.safeParse(templateId).success) return { error: "invalid_input" };
  const c = await editorContext(projectId);
  if (!c) return { error: "forbidden" };
  const { data, error } = await c.supabase.from("post_templates").delete().eq("id", templateId).eq("project_id", projectId).select("id");
  if (error) return { error: dbError(error) };
  if (!data?.length) return { error: "not_found" };
  revalidate(projectId);
  return { ok: true, data: undefined };
}

// =============================================================================================== TEXTOS GUARDADOS
const snippetSchema = z.object({
  projectId: z.uuid(),
  snippetId: z.uuid().optional(),
  kind: z.enum(["hashtags", "text"]),
  name: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(2200),
});
export type SaveSnippetInput = z.input<typeof snippetSchema>;

export async function saveSnippet(input: SaveSnippetInput): Promise<TemplateActionResult<{ id: string }>> {
  const parsed = snippetSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  // Grupo de hashtags: se normaliza ("café, #latte" → "#café #latte").
  const content = d.kind === "hashtags" ? parseHashtags(d.content).join(" ") : d.content;
  if (!content) return { error: "invalid_hashtags" };
  const c = await editorContext(d.projectId);
  if (!c) return { error: "forbidden" };
  if (d.snippetId) {
    const { data, error } = await c.supabase.from("post_snippets").update({ kind: d.kind, name: d.name, content }).eq("id", d.snippetId).eq("project_id", d.projectId).select("id");
    if (error) return { error: dbError(error) };
    if (!data?.length) return { error: "not_found" };
    revalidate(d.projectId);
    return { ok: true, data: { id: d.snippetId } };
  }
  const { data, error } = await c.supabase
    .from("post_snippets")
    .insert({ workspace_id: c.workspaceId, project_id: d.projectId, kind: d.kind, name: d.name, content, created_by: c.userId })
    .select("id")
    .single();
  if (error) return { error: dbError(error) };
  revalidate(d.projectId);
  return { ok: true, data: { id: data.id } };
}

export async function deleteSnippet(projectId: string, snippetId: string): Promise<TemplateActionResult> {
  if (!uuid.safeParse(snippetId).success) return { error: "invalid_input" };
  const c = await editorContext(projectId);
  if (!c) return { error: "forbidden" };
  const { data, error } = await c.supabase.from("post_snippets").delete().eq("id", snippetId).eq("project_id", projectId).select("id");
  if (error) return { error: dbError(error) };
  if (!data?.length) return { error: "not_found" };
  revalidate(projectId);
  return { ok: true, data: undefined };
}

// =============================================================================================== SERIES
const seriesSchema = z.object({
  projectId: z.uuid(),
  templateId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  recurrence: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .transform((w) => [...new Set(w)].sort() as Weekday[]),
    time: timeSchema,
    count: z.number().int().min(1).max(SERIES_MAX),
    intervalWeeks: z.number().int().min(1).max(4),
  }),
  /** Valores de cada hueco, uno por publicación (en orden). */
  values: z.record(z.string().max(30), z.array(z.string().max(300)).max(SERIES_MAX)).default({}),
  mode: z.enum(["draft", "pending"]),
});
export type SeriesInput = z.input<typeof seriesSchema>;

/** Motivo por el que una publicación de la serie no puede ir a aprobación y se queda en borrador. */
export type SeriesIssue = RuleViolation | "placeholders" | "no_accounts" | "account_not_active" | "duplicate_caption";
export type SeriesPreviewItem = {
  at: string;
  day: string;
  time: string;
  shifted: boolean;
  blocked: { handle: string; platform: string }[];
  caption: string;
  issues: SeriesIssue[];
};
export type SeriesPreview = { items: SeriesPreviewItem[]; skippedPast: number; requested: number; accounts: { id: string; platform: string; handle: string; dailyLimit: number }[] };

/**
 * Calcula la serie en el servidor (nunca se fía de fechas del cliente): fechas en Europe/Madrid, límite diario por
 * cuenta frente a lo ya planificado, textos con los huecos rellenados y reglas de cada red.
 */
async function planSeries(c: NonNullable<Awaited<ReturnType<typeof editorContext>>>, d: z.output<typeof seriesSchema>) {
  const { data: tpl } = await c.supabase
    .from("post_templates")
    .select("id, name, title, caption, hashtags, social_account_ids, platform_options, preferred_time")
    .eq("id", d.templateId)
    .eq("project_id", d.projectId)
    .maybeSingle();
  if (!tpl) return null;
  const template = toTemplateDTO(tpl);
  const { data: accs } = template.accountIds.length
    ? await c.supabase.from("social_accounts").select("id, platform, handle, display_name, status, daily_post_limit").eq("project_id", d.projectId).in("id", template.accountIds)
    : { data: [] as { id: string; platform: string; handle: string | null; display_name: string | null; status: string; daily_post_limit: number }[] };
  const accounts = (accs ?? []).map((a) => ({ id: a.id, platform: a.platform, status: a.status, handle: a.handle ? `@${a.handle.replace(/^@/, "")}` : (a.display_name ?? a.platform), dailyLimit: a.daily_post_limit }));

  const { occurrences, skippedPast } = seriesOccurrences(d.recurrence, { now: new Date(), tz: SERIES_TZ });
  const range = occurrenceRange(occurrences);
  let existing: { scheduledAt: string; status: string; accountIds: string[] }[] = [];
  if (range && accounts.length) {
    const { data: rows } = await c.supabase
      .from("post_targets")
      .select("social_account_id, posts!inner(scheduled_at, status)")
      .in(
        "social_account_id",
        accounts.map((a) => a.id),
      )
      .in("posts.status", [...PLANNED_STATUSES])
      .gte("posts.scheduled_at", range.from)
      .lt("posts.scheduled_at", range.to)
      .limit(5000);
    existing = (rows ?? []).filter((r) => r.posts?.scheduled_at).map((r) => ({ scheduledAt: r.posts!.scheduled_at!, status: r.posts!.status, accountIds: [r.social_account_id] }));
  }
  const planned = applyDailyLimits(occurrences, accounts, existing, SERIES_TZ);

  const baseCaption = appendHashtags(template.caption, template.hashtags);
  let n = 0; // los valores de los huecos se reparten entre las publicaciones que SÍ se crean
  const items = planned.map((o) => {
    const blocked = accounts.filter((a) => o.blockedAccountIds.includes(a.id)).map((a) => ({ handle: a.handle, platform: a.platform }));
    const values = blocked.length ? {} : valuesForOccurrence(d.values, n++);
    const caption = fillPlaceholders(baseCaption, values);
    const title = fillPlaceholders(template.title, values);
    const targets = accounts.map((a) => ({ id: a.id, platform: a.platform, status: a.status, options: optionsForPlatform(template.options, a.platform, values) }));
    const issues = new Set<SeriesIssue>();
    if (!accounts.length) issues.add("no_accounts");
    // Anti-baneo: el mismo texto en 3 o más cuentas se queda en borrador para que lo adaptes.
    if (accounts.length >= 3) issues.add("duplicate_caption");
    if (extractPlaceholders(caption, title, ...targets.map((t) => t.options.yt_title)).length) issues.add("placeholders");
    for (const t of targets) {
      if (t.status !== "active") issues.add("account_not_active");
      for (const r of validateTarget(t.platform, caption, [], t.options)) issues.add(r);
    }
    return { ...o, blocked, caption, title, targets, issues: [...issues] };
  });
  return { template, accounts, items, skippedPast };
}

export async function previewSeries(input: SeriesInput): Promise<TemplateActionResult<SeriesPreview>> {
  const parsed = seriesSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const c = await editorContext(parsed.data.projectId);
  if (!c) return { error: "forbidden" };
  const plan = await planSeries(c, parsed.data);
  if (!plan) return { error: "not_found" };
  return {
    ok: true,
    data: {
      requested: parsed.data.recurrence.count,
      skippedPast: plan.skippedPast,
      accounts: plan.accounts.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle, dailyLimit: a.dailyLimit })),
      items: plan.items.map((i) => ({ at: i.at, day: i.day, time: i.time, shifted: i.shifted, blocked: i.blocked, caption: i.caption.slice(0, 160), issues: i.issues })),
    },
  };
}

export async function createSeries(input: SeriesInput): Promise<TemplateActionResult<{ seriesId: string; created: number; pending: number; skippedLimit: number; skippedPast: number }>> {
  const parsed = seriesSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const c = await editorContext(d.projectId);
  if (!c) return { error: "forbidden" };
  const plan = await planSeries(c, d);
  if (!plan) return { error: "not_found" };
  const toCreate = plan.items.filter((i) => !i.blocked.length);
  if (!toCreate.length) return { error: plan.items.length ? "all_blocked" : "no_dates" };

  const { data: series, error: se } = await c.supabase
    .from("post_series")
    .insert({ workspace_id: c.workspaceId, project_id: d.projectId, template_id: plan.template.id, name: d.name, recurrence: d.recurrence as Json, timezone: SERIES_TZ, created_by: c.userId })
    .select("id")
    .single();
  if (se) return { error: dbError(se) };

  // Ids generados aquí para enlazar destinos sin depender del orden de RETURNING (2 inserciones en bloque).
  const rows = toCreate.map((i) => ({ ...i, id: crypto.randomUUID() }));
  const { error: pe } = await c.supabase.from("posts").insert(
    rows.map((r) => ({
      id: r.id,
      workspace_id: c.workspaceId,
      project_id: d.projectId,
      created_by: c.userId,
      series_id: series.id,
      title: r.title || null,
      caption: r.caption,
      scheduled_at: r.at,
      // Sin medios generados con IA: la etiqueta se activa sola (trigger) si luego se añade uno.
      ai_generated: false,
    })),
  );
  if (pe) {
    await c.supabase.from("post_series").delete().eq("id", series.id);
    return { error: dbError(pe) };
  }
  const targets = rows.flatMap((r) => r.targets.map((t) => ({ post_id: r.id, workspace_id: c.workspaceId, social_account_id: t.id, platform_options: t.options as Json })));
  if (targets.length) {
    const { error: te } = await c.supabase.from("post_targets").insert(targets);
    if (te) {
      await c.supabase.from("posts").delete().in("id", rows.map((r) => r.id));
      await c.supabase.from("post_series").delete().eq("id", series.id);
      return { error: dbError(te) };
    }
  }

  // «Pendientes de aprobación»: solo las que cumplen las reglas de cada red. NUNCA se aprueban aquí.
  let pending = 0;
  if (d.mode === "pending") {
    const ready = rows.filter((r) => !r.issues.length).map((r) => r.id);
    if (ready.length) {
      const { data: n, error: sube } = await c.supabase.rpc("submit_posts", { p_post_ids: ready });
      if (!sube) pending = n ?? ready.length;
    }
  }
  revalidate(d.projectId);
  revalidatePath(`/app/p/${d.projectId}/calendar`);
  revalidatePath("/app/calendar");
  return {
    ok: true,
    data: { seriesId: series.id, created: rows.length, pending, skippedLimit: plan.items.length - rows.length, skippedPast: plan.skippedPast },
  };
}

/** Borra las publicaciones de una serie que aún no están aprobadas (borradores y pendientes). Las aprobadas se quedan. */
export async function deleteSeriesDrafts(projectId: string, seriesId: string): Promise<TemplateActionResult<{ deleted: number; kept: number }>> {
  if (!uuid.safeParse(seriesId).success) return { error: "invalid_input" };
  const c = await editorContext(projectId);
  if (!c) return { error: "forbidden" };
  const { data, error } = await c.supabase.from("posts").delete().eq("series_id", seriesId).eq("project_id", projectId).in("status", ["draft", "pending_approval"]).select("id");
  if (error) return { error: dbError(error) };
  const { count } = await c.supabase.from("posts").select("id", { count: "exact", head: true }).eq("series_id", seriesId);
  if (!count) await c.supabase.from("post_series").delete().eq("id", seriesId).eq("project_id", projectId);
  revalidate(projectId);
  revalidatePath(`/app/p/${projectId}/calendar`);
  revalidatePath("/app/calendar");
  return { ok: true, data: { deleted: data?.length ?? 0, kept: count ?? 0 } };
}
