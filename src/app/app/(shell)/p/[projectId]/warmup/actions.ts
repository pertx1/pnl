"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { COACH_VERSION, coachPlan } from "@/lib/agents/coach";
import { brandFor, withCharge } from "@/lib/strategy/charge";
import { CREDITS, PLATFORMS, WARMUP_ISSUES, type WarmupTaskDraft } from "@/lib/strategy/schema";
import { sanitizeWarmupTasks } from "@/lib/strategy/warmup";
import { issueAdjustments, warmupTemplate } from "@/lib/strategy/warmup-templates";
import { toErrorKey } from "@/lib/server/errors";
import { createClient } from "@/lib/supabase/server";

export type WarmupResult<T = undefined> = ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok?: false; error: string };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function revalidate(projectId: string) {
  revalidatePath(`/app/p/${projectId}/warmup`);
}

async function loadPlan(projectId: string, planId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: plan } = await supabase.from("warmup_plans").select("*").eq("id", planId).eq("project_id", projectId).maybeSingle();
  if (!plan) return null;
  return { supabase, user: auth.user, plan };
}

function rows(tasks: WarmupTaskDraft[], plan: { id: string; workspace_id: string }, source: "template" | "ai" | "adjust", startPos = 0) {
  const pos = new Map<number, number>();
  return tasks.map((t) => {
    const p = (pos.get(t.day) ?? startPos) + 1;
    pos.set(t.day, p);
    return {
      workspace_id: plan.workspace_id,
      plan_id: plan.id,
      day: t.day,
      position: Math.min(100, p),
      category: t.category,
      title: t.title,
      detail: t.detail,
      target_count: t.targetCount,
      source,
    };
  });
}

/** Crea un plan de calentamiento desde la plantilla de la red (gratis, sin IA). */
export async function createWarmupPlan(input: {
  projectId: string;
  accountId: string | null;
  platform: string;
  handle: string;
  niche: string;
  durationDays: number;
  startDate: string;
}): Promise<WarmupResult<{ planId: string }>> {
  const parsed = z
    .object({
      projectId: z.uuid(),
      accountId: z.uuid().nullable(),
      platform: z.enum(PLATFORMS),
      handle: z.string().trim().max(60),
      niche: z.string().trim().max(200),
      durationDays: z.number().int().min(7).max(14),
      startDate: isoDate,
    })
    .safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", d.projectId).maybeSingle();
  if (!auth.user || !project) return { error: "not_found" };

  let platform = d.platform;
  let handle = d.handle.replace(/^@/, "") || null;
  if (d.accountId) {
    const { data: acc } = await supabase.from("social_accounts").select("platform, handle").eq("id", d.accountId).eq("project_id", d.projectId).maybeSingle();
    if (!acc) return { error: "not_found" };
    platform = acc.platform;
    handle = acc.handle;
  }
  const locale = (await getLocale()) === "en" ? "en" : "es";
  const { data: plan, error } = await supabase
    .from("warmup_plans")
    .insert({
      workspace_id: project.workspace_id,
      project_id: d.projectId,
      social_account_id: d.accountId,
      platform,
      handle,
      niche: d.niche,
      locale,
      start_date: d.startDate,
      duration_days: d.durationDays,
      source: "template",
      created_by: auth.user.id,
    })
    .select("id, workspace_id")
    .single();
  if (error) return { error: toErrorKey(error) };
  const { error: te } = await supabase.from("warmup_tasks").insert(rows(warmupTemplate(platform, d.durationDays, d.niche, locale), plan, "template"));
  if (te) {
    await supabase.from("warmup_plans").delete().eq("id", plan.id);
    return { error: toErrorKey(te) };
  }
  revalidate(d.projectId);
  return { ok: true, data: { planId: plan.id } };
}

/** Marcar / desmarcar una tarea. El plan pasa a "completado" cuando no quedan tareas. */
export async function toggleWarmupTask(projectId: string, taskId: string, done: boolean): Promise<WarmupResult> {
  const parsed = z.object({ p: z.uuid(), t: z.uuid(), d: z.boolean() }).safeParse({ p: projectId, t: taskId, d: done });
  if (!parsed.success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "forbidden" };
  const { data, error } = await supabase
    .from("warmup_tasks")
    .update({ done_at: done ? new Date().toISOString() : null, done_by: done ? auth.user.id : null })
    .eq("id", taskId)
    .select("plan_id");
  if (error) return { error: toErrorKey(error) };
  if (!data?.length) return { error: "forbidden" };
  const planId = data[0].plan_id;
  const { count } = await supabase.from("warmup_tasks").select("id", { count: "exact", head: true }).eq("plan_id", planId).is("done_at", null);
  const { data: plan } = await supabase.from("warmup_plans").select("status").eq("id", planId).single();
  if (plan && plan.status !== "archived") {
    const status = (count ?? 0) === 0 ? "completed" : "active";
    if (status !== plan.status) await supabase.from("warmup_plans").update({ status }).eq("id", planId);
  }
  revalidate(projectId);
  return { ok: true };
}

/** Recordatorio diario por email (opt-in, solo para quien lo activa). */
export async function setWarmupReminder(projectId: string, planId: string, enabled: boolean): Promise<WarmupResult> {
  if (!z.uuid().safeParse(planId).success) return { error: "invalid_input" };
  const c = await loadPlan(projectId, planId);
  if (!c) return { error: "not_found" };
  if (!enabled && c.plan.reminder_user_id && c.plan.reminder_user_id !== c.user.id) return { error: "forbidden" };
  const { error } = await c.supabase.from("warmup_plans").update({ reminder_user_id: enabled ? c.user.id : null }).eq("id", planId);
  if (error) return { error: toErrorKey(error) };
  revalidate(projectId);
  return { ok: true };
}

export async function setWarmupStatus(projectId: string, planId: string, status: "active" | "archived"): Promise<WarmupResult> {
  if (!z.uuid().safeParse(planId).success || !["active", "archived"].includes(status)) return { error: "invalid_input" };
  const c = await loadPlan(projectId, planId);
  if (!c) return { error: "not_found" };
  const { error } = await c.supabase.from("warmup_plans").update({ status, ...(status === "archived" ? { reminder_user_id: null } : {}) }).eq("id", planId);
  if (error) return { error: toErrorKey(error) };
  revalidate(projectId);
  return { ok: true };
}

export async function deleteWarmupPlan(projectId: string, planId: string): Promise<WarmupResult> {
  if (!z.uuid().safeParse(planId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("warmup_plans").delete().eq("id", planId).eq("project_id", projectId).select("id");
  if (error) return { error: toErrorKey(error) };
  if (!data?.length) return { error: "forbidden" };
  revalidate(projectId);
  return { ok: true };
}

const adjustSchema = z.object({
  projectId: z.uuid(),
  planId: z.uuid(),
  issues: z.array(z.enum(WARMUP_ISSUES)).max(WARMUP_ISSUES.length),
  fromDay: z.number().int().min(1).max(14),
});

/** Ajuste SIN IA: añade tareas concretas para los problemas marcados (gratis). */
export async function adjustWarmupPlan(input: z.input<typeof adjustSchema>): Promise<WarmupResult<{ added: number }>> {
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success || !parsed.data.issues.length) return { error: "invalid_input" };
  const d = parsed.data;
  const c = await loadPlan(d.projectId, d.planId);
  if (!c) return { error: "not_found" };
  const { data: existing } = await c.supabase.from("warmup_tasks").select("title, day, position").eq("plan_id", d.planId);
  const extra = issueAdjustments(d.issues, {
    platform: c.plan.platform,
    niche: c.plan.niche,
    locale: c.plan.locale,
    fromDay: Math.min(d.fromDay, c.plan.duration_days),
    durationDays: c.plan.duration_days,
    existingTitles: (existing ?? []).map((e) => e.title),
  });
  const maxPos = Math.max(0, ...(existing ?? []).map((e) => e.position));
  const issues = [...new Set([...c.plan.issues, ...d.issues])];
  const { error: ue } = await c.supabase.from("warmup_plans").update({ issues, status: "active" }).eq("id", d.planId);
  if (ue) return { error: toErrorKey(ue) };
  if (extra.length) {
    const { error } = await c.supabase.from("warmup_tasks").insert(rows(extra, c.plan, "adjust", Math.min(90, maxPos)));
    if (error) return { error: toErrorKey(error) };
  }
  revalidate(d.projectId);
  return { ok: true, data: { added: extra.length } };
}

/**
 * Coach con IA (2 créditos): personaliza los días que quedan según el nicho y los problemas marcados.
 * Las tareas ya hechas se conservan; las pendientes desde `fromDay` se sustituyen por la propuesta (filtrada por seguridad).
 */
export async function aiCoachWarmup(input: z.input<typeof adjustSchema> & { idempotencyKey: string }): Promise<WarmupResult<{ tips: string[] }>> {
  const parsed = adjustSchema.extend({ idempotencyKey: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const c = await loadPlan(d.projectId, d.planId);
  if (!c) return { error: "not_found" };
  const brand = await brandFor(d.projectId);
  if (!brand) return { error: "not_found" };
  const fromDay = Math.min(d.fromDay, c.plan.duration_days);
  const { data: existing } = await c.supabase.from("warmup_tasks").select("id, title, day, done_at").eq("plan_id", d.planId);
  const issues = [...new Set([...c.plan.issues, ...d.issues])];

  const res = await withCharge({
    projectId: d.projectId,
    agent: "coach",
    promptVersion: COACH_VERSION,
    prompt: `${c.plan.platform} · ${c.plan.niche} · ${issues.join(",")}`,
    credits: CREDITS.coach,
    idempotencyKey: d.idempotencyKey,
    run: async () => {
      const out = await coachPlan(brand, {
        platform: c.plan.platform,
        niche: c.plan.niche,
        fromDay,
        durationDays: c.plan.duration_days,
        issues,
        doneTitles: (existing ?? []).filter((e) => e.done_at).map((e) => e.title),
        locale: c.plan.locale,
      });
      const tasks = sanitizeWarmupTasks(out.tasks, c.plan.duration_days).filter((x) => x.day >= fromDay).slice(0, 80);
      if (!tasks.length) throw new Error("empty_plan"); // → reembolso automático
      return { tasks, tips: out.tips.map((x) => x.trim().slice(0, 300)).filter(Boolean).slice(0, 5) };
    },
  });
  if (!res.ok) return { error: res.error };

  const toDelete = (existing ?? []).filter((e) => !e.done_at && e.day >= fromDay).map((e) => e.id);
  if (toDelete.length) await c.supabase.from("warmup_tasks").delete().in("id", toDelete);
  const { error } = await c.supabase.from("warmup_tasks").insert(rows(res.data.tasks, c.plan, "ai", 50));
  if (error) return { error: toErrorKey(error) };
  await c.supabase
    .from("warmup_plans")
    .update({ issues, status: "active", source: "ai", prompt_version: COACH_VERSION, ai_generation_id: res.generationId })
    .eq("id", d.planId);
  revalidate(d.projectId);
  return { ok: true, data: { tips: res.data.tips } };
}
