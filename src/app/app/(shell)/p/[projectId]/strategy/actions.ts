"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { addDaysIso, localIsoDay, localToUtcIso } from "@/lib/strategy/dates";
import { getProjectAccounts, loadStrategyDoc, writeStrategyDoc } from "@/lib/strategy/data";
import { hasCrossAccountDuplicates, planCalendar, type PlannedSlot } from "@/lib/strategy/planner";
import { strategyDocSchema, type StrategyDoc } from "@/lib/strategy/schema";
import { STRATEGY_GOALS, strategyTemplate } from "@/lib/strategy/templates";
import { toErrorKey } from "@/lib/server/errors";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok?: false; error: string };

const PLAN_DAYS = 14;
const tzSchema = z.number().int().min(-840).max(840);

function revalidate(projectId: string) {
  revalidatePath(`/app/p/${projectId}/strategy`);
}

async function ctx(projectId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: project } = await supabase.from("projects").select("id, workspace_id").eq("id", projectId).maybeSingle();
  if (!project) return null;
  return { supabase, user: auth.user, project };
}

/** Crea la estrategia de un ámbito (proyecto o cuenta) desde una plantilla (sin IA, gratis). */
export async function createStrategyFromTemplate(input: { projectId: string; accountId: string | null; goal: string; tzOffset: number }): Promise<ActionResult<{ strategyId: string }>> {
  const parsed = z
    .object({ projectId: z.uuid(), accountId: z.uuid().nullable(), goal: z.enum(STRATEGY_GOALS), tzOffset: tzSchema })
    .safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const c = await ctx(d.projectId);
  if (!c) return { error: "not_found" };
  const accounts = await getProjectAccounts(c.supabase, d.projectId);
  const scoped = d.accountId ? accounts.filter((a) => a.id === d.accountId) : accounts;
  if (d.accountId && !scoped.length) return { error: "not_found" };
  const platforms = [...new Set(scoped.map((a) => a.platform))];
  const locale = (await getLocale()) === "en" ? "en" : "es";
  const doc = strategyTemplate(d.goal, locale, localIsoDay(new Date(), d.tzOffset), platforms, () => crypto.randomUUID());

  const { data: s, error } = await c.supabase
    .from("strategies")
    .insert({ workspace_id: c.project.workspace_id, project_id: d.projectId, social_account_id: d.accountId, created_by: c.user.id, source: "template" })
    .select("id, workspace_id, project_id")
    .single();
  if (error) return { error: error.code === "23505" ? "already_exists" : toErrorKey(error) };
  const w = await writeStrategyDoc(c.supabase, s, doc);
  if ("error" in w) return { error: w.error };
  revalidate(d.projectId);
  return { ok: true, data: { strategyId: s.id } };
}

/** Crea una estrategia vacía (para escribirla desde cero). */
export async function createEmptyStrategy(input: { projectId: string; accountId: string | null }): Promise<ActionResult<{ strategyId: string }>> {
  const parsed = z.object({ projectId: z.uuid(), accountId: z.uuid().nullable() }).safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const c = await ctx(parsed.data.projectId);
  if (!c) return { error: "not_found" };
  const { data: s, error } = await c.supabase
    .from("strategies")
    .insert({ workspace_id: c.project.workspace_id, project_id: c.project.id, social_account_id: parsed.data.accountId, created_by: c.user.id, source: "manual" })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? "already_exists" : toErrorKey(error) };
  revalidate(c.project.id);
  return { ok: true, data: { strategyId: s.id } };
}

export async function saveStrategy(input: { projectId: string; strategyId: string; doc: StrategyDoc }): Promise<ActionResult> {
  const parsed = z.object({ projectId: z.uuid(), strategyId: z.uuid(), doc: strategyDocSchema }).safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const c = await ctx(parsed.data.projectId);
  if (!c) return { error: "not_found" };
  const { data: s } = await c.supabase
    .from("strategies")
    .select("id, workspace_id, project_id")
    .eq("id", parsed.data.strategyId)
    .eq("project_id", parsed.data.projectId)
    .maybeSingle();
  if (!s) return { error: "not_found" };
  const w = await writeStrategyDoc(c.supabase, s, parsed.data.doc);
  if ("error" in w) return { error: w.error };
  revalidate(parsed.data.projectId);
  return { ok: true };
}

export async function deleteStrategy(projectId: string, strategyId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(strategyId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("strategies").delete().eq("id", strategyId).eq("project_id", projectId).select("id");
  if (error) return { error: toErrorKey(error) };
  if (!data?.length) return { error: "forbidden" };
  revalidate(projectId);
  return { ok: true };
}

/**
 * "Pasar al calendario": convierte una tarea del roadmap en un BORRADOR de publicación.
 * Nunca se envía a aprobación ni se programa: el post queda en `draft` y sigue el flujo normal (revisar → enviar → aprobar).
 */
export async function taskToCalendar(input: { projectId: string; taskId: string; tzOffset: number }): Promise<ActionResult<{ postId: string; targeted: boolean }>> {
  const parsed = z.object({ projectId: z.uuid(), taskId: z.uuid(), tzOffset: tzSchema }).safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const c = await ctx(d.projectId);
  if (!c) return { error: "not_found" };
  const { data: task } = await c.supabase
    .from("roadmap_tasks")
    .select("id, title, brief, platform, due_date, status, post_id, strategy_id, project_id")
    .eq("id", d.taskId)
    .eq("project_id", d.projectId)
    .maybeSingle();
  if (!task) return { error: "not_found" };
  if (task.post_id) return { ok: true, data: { postId: task.post_id, targeted: true } };

  const { data: strategy } = await c.supabase.from("strategies").select("social_account_id").eq("id", task.strategy_id).maybeSingle();
  const accounts = (await getProjectAccounts(c.supabase, d.projectId)).filter((a) => a.status === "active");
  // Cuenta destino: la de la estrategia; si no, la ÚNICA cuenta activa de esa red. Si hay varias, el usuario elige en el editor.
  let accountId: string | null = null;
  if (strategy?.social_account_id) accountId = accounts.find((a) => a.id === strategy.social_account_id)?.id ?? null;
  else if (task.platform) {
    const same = accounts.filter((a) => a.platform === task.platform);
    if (same.length === 1) accountId = same[0].id;
  }

  const today = localIsoDay(new Date(), d.tzOffset);
  const day = task.due_date && task.due_date >= today ? task.due_date : null;
  let scheduledAt = day ? localToUtcIso(day, 10, 0, d.tzOffset) : null;
  if (scheduledAt && new Date(scheduledAt).getTime() < Date.now() + 30 * 60000) scheduledAt = localToUtcIso(addDaysIso(today, 1), 10, 0, d.tzOffset);

  const { data: post, error } = await c.supabase
    .from("posts")
    .insert({
      workspace_id: c.project.workspace_id,
      project_id: d.projectId,
      created_by: c.user.id,
      title: task.title.slice(0, 120),
      caption: (task.brief || task.title).slice(0, 2200),
      scheduled_at: scheduledAt,
      ai_generated: false,
    })
    .select("id")
    .single();
  if (error) return { error: toErrorKey(error) };
  if (accountId) {
    const { error: te } = await c.supabase.from("post_targets").insert({ post_id: post.id, workspace_id: c.project.workspace_id, social_account_id: accountId, platform_options: {} });
    if (te) accountId = null;
  }
  await c.supabase
    .from("roadmap_tasks")
    .update({ post_id: post.id, status: task.status === "todo" ? "doing" : task.status })
    .eq("id", task.id);
  revalidate(d.projectId);
  revalidatePath(`/app/p/${d.projectId}/calendar`);
  return { ok: true, data: { postId: post.id, targeted: Boolean(accountId) } };
}

// -----------------------------------------------------------------------------------------------
// Planificador: vista previa (gratis) y creación de borradores tras confirmación del usuario.
// -----------------------------------------------------------------------------------------------
async function plannerContext(c: NonNullable<Awaited<ReturnType<typeof ctx>>>, strategyId: string, tzOffset: number) {
  const loaded = await loadStrategyDoc(c.supabase, strategyId);
  if (!loaded || loaded.row.project_id !== c.project.id) return null;
  const all = await getProjectAccounts(c.supabase, c.project.id);
  const accounts = all.filter(
    (a) => a.status === "active" && (!loaded.row.social_account_id || a.id === loaded.row.social_account_id) && loaded.doc.frequency.some((f) => f.platform === a.platform),
  );
  const startDay = localIsoDay(new Date(), tzOffset);
  const from = localToUtcIso(addDaysIso(startDay, -1), 0, 0, tzOffset);
  const to = localToUtcIso(addDaysIso(startDay, PLAN_DAYS + 1), 0, 0, tzOffset);
  const ids = accounts.map((a) => a.id);
  const { data: existing } = ids.length
    ? await c.supabase
        .from("post_targets")
        .select("social_account_id, posts!inner(scheduled_at, status)")
        .in("social_account_id", ids)
        .gte("posts.scheduled_at", from)
        .lt("posts.scheduled_at", to)
        .not("posts.status", "in", "(cancelled,failed)")
    : { data: [] };
  return {
    loaded,
    accounts,
    startDay,
    existing: (existing ?? [])
      .filter((e) => e.posts?.scheduled_at)
      .map((e) => ({ accountId: e.social_account_id, scheduledAt: new Date(e.posts!.scheduled_at!).toISOString() })),
  };
}

export async function previewPlan(input: { projectId: string; strategyId: string; tzOffset: number }): Promise<ActionResult<{ slots: PlannedSlot[]; skipped: { accountId: string; count: number }[]; accounts: number }>> {
  const parsed = z.object({ projectId: z.uuid(), strategyId: z.uuid(), tzOffset: tzSchema }).safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const c = await ctx(parsed.data.projectId);
  if (!c) return { error: "not_found" };
  const p = await plannerContext(c, parsed.data.strategyId, parsed.data.tzOffset);
  if (!p) return { error: "not_found" };
  if (!p.accounts.length) return { error: "no_accounts" };
  if (!p.loaded.doc.pillars.length) return { error: "no_pillars" };
  const locale = (await getLocale()) === "en" ? "en" : "es";
  const res = planCalendar({
    accounts: p.accounts.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle, dailyLimit: a.dailyLimit })),
    frequency: p.loaded.doc.frequency,
    pillars: p.loaded.doc.pillars,
    startDay: p.startDay,
    days: PLAN_DAYS,
    tzOffsetMinutes: parsed.data.tzOffset,
    existing: p.existing,
    locale,
    now: new Date(),
  });
  return { ok: true, data: { ...res, accounts: p.accounts.length } };
}

const slotInput = z.object({
  accountId: z.uuid(),
  scheduledAt: z.iso.datetime({ offset: true }),
  title: z.string().trim().max(120),
  caption: z.string().trim().min(1).max(2200),
});

/** Crea los borradores confirmados. Revalida en el servidor límites diarios, fechas y textos repetidos entre cuentas. */
export async function createPlannedDrafts(input: {
  projectId: string;
  strategyId: string;
  tzOffset: number;
  slots: z.input<typeof slotInput>[];
}): Promise<ActionResult<{ created: number }>> {
  const parsed = z
    .object({ projectId: z.uuid(), strategyId: z.uuid(), tzOffset: tzSchema, slots: z.array(slotInput).min(1).max(80) })
    .safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const c = await ctx(d.projectId);
  if (!c) return { error: "not_found" };
  const p = await plannerContext(c, d.strategyId, d.tzOffset);
  if (!p) return { error: "not_found" };

  const byId = new Map(p.accounts.map((a) => [a.id, a]));
  const now = Date.now();
  const counts = new Map<string, number>();
  for (const e of p.existing) counts.set(`${e.accountId}|${e.scheduledAt.slice(0, 10)}`, (counts.get(`${e.accountId}|${e.scheduledAt.slice(0, 10)}`) ?? 0) + 1);
  for (const s of d.slots) {
    const acc = byId.get(s.accountId);
    if (!acc) return { error: "invalid_input" };
    const t = new Date(s.scheduledAt).getTime();
    if (t < now || t > now + (PLAN_DAYS + 2) * 86400000) return { error: "invalid_input" };
    const k = `${s.accountId}|${new Date(s.scheduledAt).toISOString().slice(0, 10)}`;
    const n = (counts.get(k) ?? 0) + 1;
    if (n > acc.dailyLimit) return { error: "daily_limit_exceeded" };
    counts.set(k, n);
  }
  if (hasCrossAccountDuplicates(d.slots)) return { error: "duplicate_text" };

  let created = 0;
  for (const s of d.slots) {
    const { data: post, error } = await c.supabase
      .from("posts")
      .insert({
        workspace_id: c.project.workspace_id,
        project_id: d.projectId,
        created_by: c.user.id,
        title: s.title || null,
        caption: s.caption,
        scheduled_at: new Date(s.scheduledAt).toISOString(),
        // Texto sugerido por IA con revisión humana: no activa la etiqueta IA (ver docs/compliance.md, art. 50.4 AI Act).
        ai_generated: false,
      })
      .select("id")
      .single();
    if (error) break;
    const { error: te } = await c.supabase
      .from("post_targets")
      .insert({ post_id: post.id, workspace_id: c.project.workspace_id, social_account_id: s.accountId, platform_options: {} });
    if (te) {
      await c.supabase.from("posts").delete().eq("id", post.id);
      break;
    }
    created++;
  }
  revalidatePath(`/app/p/${d.projectId}/calendar`);
  revalidatePath("/app/calendar");
  if (!created) return { error: "forbidden" };
  return { ok: true, data: { created } };
}
