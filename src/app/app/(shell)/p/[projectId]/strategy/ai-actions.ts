"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { ESTRATEGA_VERSION, generateStrategy, type StrategyOutput } from "@/lib/agents/estratega";
import { PLANIFICADOR_VERSION, writeDrafts } from "@/lib/agents/planificador";
import { brandFor, withCharge } from "@/lib/strategy/charge";
import { accountLabel, getProjectAccounts, metricsSummary, writeStrategyDoc } from "@/lib/strategy/data";
import { addDaysIso, localIsoDay } from "@/lib/strategy/dates";
import { CREDITS, PLATFORMS, strategyDocSchema, type Platform, type StrategyDoc } from "@/lib/strategy/schema";
import { createClient } from "@/lib/supabase/server";

type Result<T> = { ok: true; data: T } | { ok?: false; error: string };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)));
const cut = (s: string, n: number) => s.trim().slice(0, n);

/** Convierte la salida del Estratega en un documento válido (recortes, IDs, fechas absolutas y solo redes del ámbito). */
function toDoc(out: StrategyOutput, startDay: string, platforms: Platform[]): StrategyDoc {
  const allowed = (p: string): p is Platform => (PLATFORMS as readonly string[]).includes(p) && (!platforms.length || platforms.includes(p as Platform));
  const doc: StrategyDoc = {
    title: cut(out.title, 120),
    summary: cut(out.summary, 2000),
    audience: cut(out.audience, 2000),
    pillars: out.pillars.slice(0, 12).map((p) => ({
      id: crypto.randomUUID(),
      name: cut(p.name, 80) || "—",
      description: cut(p.description, 500),
      examples: p.examples.map((e) => cut(e, 200)).filter(Boolean).slice(0, 8),
      share: clamp(p.share, 0, 100),
    })),
    frequency: out.frequency
      .filter((f) => allowed(f.platform))
      .filter((f, i, arr) => arr.findIndex((x) => x.platform === f.platform) === i)
      .map((f) => ({ platform: f.platform, postsPerWeek: clamp(f.postsPerWeek, 0, 21), hour: clamp(f.hour, 0, 23) })),
    objectives: out.objectives.slice(0, 20).map((o) => ({
      id: crypto.randomUUID(),
      objective: cut(o.objective, 200) || "—",
      kpi: cut(o.kpi, 120),
      target: cut(o.target, 60),
      deadline: addDaysIso(startDay, clamp(o.dayOffset, 0, 365)),
    })),
    milestones: out.milestones.slice(0, 20).map((m) => ({
      id: crypto.randomUUID(),
      title: cut(m.title, 160) || "—",
      description: cut(m.description, 1000),
      dueDate: addDaysIso(startDay, clamp(m.dayOffset, 0, 365)),
      tasks: m.tasks.slice(0, 40).map((t) => ({
        id: crypto.randomUUID(),
        title: cut(t.title, 200) || "—",
        brief: cut(t.brief, 2000),
        platform: allowed(t.platform) ? t.platform : null,
        status: "todo" as const,
        assigneeId: null,
        dueDate: addDaysIso(startDay, clamp(t.dayOffset, 0, 365)),
        postId: null,
      })),
    })),
  };
  return strategyDocSchema.parse(doc);
}

/** Estratega (3 créditos): genera la estrategia + roadmap. Si ya hay una en ese ámbito, la sustituye (el usuario lo confirma antes). */
export async function aiGenerateStrategy(input: {
  projectId: string;
  accountId: string | null;
  goal: string;
  notes: string;
  tzOffset: number;
  idempotencyKey: string;
}): Promise<Result<{ strategyId: string }>> {
  const parsed = z
    .object({
      projectId: z.uuid(),
      accountId: z.uuid().nullable(),
      goal: z.string().trim().min(3).max(300),
      notes: z.string().trim().max(2000),
      tzOffset: z.number().int().min(-840).max(840),
      idempotencyKey: z.uuid(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: project } = await supabase.from("projects").select("id, workspace_id").eq("id", d.projectId).maybeSingle();
  if (!auth.user || !project) return { error: "not_found" };
  const brand = await brandFor(d.projectId);
  if (!brand) return { error: "not_found" };

  const accounts = await getProjectAccounts(supabase, d.projectId);
  const scoped = d.accountId ? accounts.filter((a) => a.id === d.accountId) : accounts;
  if (d.accountId && !scoped.length) return { error: "not_found" };
  const platforms = [...new Set(scoped.map((a) => a.platform))];
  const metrics = await metricsSummary(supabase, scoped);
  const locale = await getLocale();
  const startDay = localIsoDay(new Date(), d.tzOffset);

  const res = await withCharge({
    projectId: d.projectId,
    agent: "estratega",
    promptVersion: ESTRATEGA_VERSION,
    prompt: `${d.goal}\n${d.notes}`,
    credits: CREDITS.strategy,
    idempotencyKey: d.idempotencyKey,
    run: async () =>
      toDoc(
        await generateStrategy(brand, {
          goal: d.goal,
          notes: d.notes,
          platforms,
          accountLabel: d.accountId && scoped[0] ? `${scoped[0].platform} ${accountLabel(scoped[0])}` : null,
          metrics,
          locale,
        }),
        startDay,
        platforms,
      ),
  });
  if (!res.ok) return { error: res.error };

  // Buscar o crear la estrategia del ámbito y escribir el documento.
  let q = supabase.from("strategies").select("id, workspace_id, project_id").eq("project_id", d.projectId);
  q = d.accountId ? q.eq("social_account_id", d.accountId) : q.is("social_account_id", null);
  let { data: s } = await q.maybeSingle();
  if (!s) {
    const ins = await supabase
      .from("strategies")
      .insert({ workspace_id: project.workspace_id, project_id: d.projectId, social_account_id: d.accountId, created_by: auth.user.id, source: "ai" })
      .select("id, workspace_id, project_id")
      .single();
    if (ins.error) return { error: "generic" };
    s = ins.data;
  }
  const w = await writeStrategyDoc(supabase, s, res.data, { source: "ai", promptVersion: ESTRATEGA_VERSION, generationId: res.generationId });
  if ("error" in w) return { error: w.error };
  revalidatePath(`/app/p/${d.projectId}/strategy`);
  return { ok: true, data: { strategyId: s.id } };
}

/** Planificador con IA (2 créditos): redacta el texto de los borradores ya repartidos. Devuelve una PROPUESTA; no crea nada. */
export async function aiWritePlanDrafts(input: {
  projectId: string;
  idempotencyKey: string;
  slots: { key: string; accountId: string; platform: string; account: string; pillar: string; idea: string; day: string }[];
}): Promise<Result<{ key: string; title: string; caption: string }[]>> {
  const parsed = z
    .object({
      projectId: z.uuid(),
      idempotencyKey: z.uuid(),
      slots: z
        .array(
          z.object({
            key: z.string().max(120),
            accountId: z.uuid(),
            platform: z.enum(PLATFORMS),
            account: z.string().max(80),
            pillar: z.string().max(80),
            idea: z.string().max(200),
            day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          }),
        )
        .min(1)
        .max(80),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const brand = await brandFor(d.projectId);
  if (!brand) return { error: "not_found" };
  const locale = await getLocale();
  const keys = new Set(d.slots.map((s) => s.key));
  const res = await withCharge({
    projectId: d.projectId,
    agent: "planificador",
    promptVersion: PLANIFICADOR_VERSION,
    prompt: d.slots.map((s) => `${s.pillar}: ${s.idea}`).join("\n"),
    credits: CREDITS.planner,
    idempotencyKey: d.idempotencyKey,
    run: async () => (await writeDrafts(brand, { slots: d.slots, locale })).drafts,
  });
  if (!res.ok) return { error: res.error };
  const banned = brand.bannedWords.map((w) => w.toLowerCase()).filter(Boolean);
  const drafts = res.data
    .filter((x) => keys.has(x.key))
    .map((x) => ({ key: x.key, title: x.title.trim().slice(0, 120), caption: x.caption.trim().slice(0, 2200) }))
    // Palabras prohibidas del brand kit: se descarta la propuesta (se queda el texto de plantilla).
    .filter((x) => x.caption && !banned.some((w) => x.caption.toLowerCase().includes(w)));
  return { ok: true, data: drafts };
}
