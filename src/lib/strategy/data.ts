import "server-only";
import { createClient } from "@/lib/supabase/server";
import { frequencySchema, objectiveSchema, parseJsonArray, pillarSchema, type Platform, type StrategyDoc } from "./schema";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type StrategyAccount = { id: string; platform: Platform; handle: string | null; displayName: string | null; status: string; dailyLimit: number };

export async function getProjectAccounts(supabase: Supabase, projectId: string): Promise<StrategyAccount[]> {
  const { data } = await supabase
    .from("social_accounts")
    .select("id, platform, handle, display_name, status, daily_post_limit")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((a) => ({ id: a.id, platform: a.platform, handle: a.handle, displayName: a.display_name, status: a.status, dailyLimit: a.daily_post_limit }));
}

export function accountLabel(a: Pick<StrategyAccount, "handle" | "displayName" | "platform">) {
  return a.handle ? `@${a.handle.replace(/^@/, "")}` : (a.displayName ?? a.platform);
}

/** Estrategia + roadmap como documento editable. */
export async function loadStrategyDoc(supabase: Supabase, strategyId: string) {
  const { data: s } = await supabase.from("strategies").select("*").eq("id", strategyId).maybeSingle();
  if (!s) return null;
  const [{ data: ms }, { data: ts }] = await Promise.all([
    supabase.from("roadmap_milestones").select("*").eq("strategy_id", strategyId).order("position"),
    supabase.from("roadmap_tasks").select("*").eq("strategy_id", strategyId).order("position"),
  ]);
  const doc: StrategyDoc = {
    title: s.title,
    summary: s.summary,
    audience: s.audience,
    pillars: parseJsonArray(s.pillars, pillarSchema),
    frequency: parseJsonArray(s.frequency, frequencySchema),
    objectives: parseJsonArray(s.objectives, objectiveSchema),
    milestones: (ms ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      dueDate: m.due_date,
      tasks: (ts ?? [])
        .filter((t) => t.milestone_id === m.id)
        .map((t) => ({
          id: t.id,
          title: t.title,
          brief: t.brief,
          platform: t.platform,
          status: t.status,
          assigneeId: t.assignee_id,
          dueDate: t.due_date,
          postId: t.post_id,
        })),
    })),
  };
  return { row: s, doc };
}

/**
 * Escribe el documento completo (estrategia + hitos + tareas) con la sesión del usuario (RLS: editor).
 * - Los IDs que no existen ya en ESTA estrategia se sustituyen por IDs nuevos (no se puede "robar" una fila de otra).
 * - `post_id` nunca viene del cliente: se conserva el que había.
 */
export async function writeStrategyDoc(
  supabase: Supabase,
  s: { id: string; workspace_id: string; project_id: string },
  doc: StrategyDoc,
  meta?: { source?: "manual" | "template" | "ai"; promptVersion?: string | null; generationId?: string | null },
): Promise<{ ok: true } | { error: string }> {
  const { error: e1 } = await supabase
    .from("strategies")
    .update({
      title: doc.title,
      summary: doc.summary,
      audience: doc.audience,
      pillars: doc.pillars,
      frequency: doc.frequency,
      objectives: doc.objectives,
      ...(meta?.source ? { source: meta.source } : {}),
      ...(meta?.promptVersion !== undefined ? { prompt_version: meta.promptVersion } : {}),
      ...(meta?.generationId !== undefined ? { ai_generation_id: meta.generationId } : {}),
    })
    .eq("id", s.id);
  if (e1) return { error: e1.code === "42501" ? "forbidden" : "generic" };

  const [{ data: exM }, { data: exT }] = await Promise.all([
    supabase.from("roadmap_milestones").select("id").eq("strategy_id", s.id),
    supabase.from("roadmap_tasks").select("id, post_id").eq("strategy_id", s.id),
  ]);
  const existingM = new Set((exM ?? []).map((m) => m.id));
  const existingT = new Map((exT ?? []).map((t) => [t.id, t.post_id]));

  const milestones = doc.milestones.map((m, i) => ({ ...m, id: existingM.has(m.id) ? m.id : crypto.randomUUID(), position: i }));
  const keepM = new Set(milestones.map((m) => m.id));
  const tasks = milestones.flatMap((m) =>
    m.tasks.map((t, i) => ({ ...t, id: existingT.has(t.id) ? t.id : crypto.randomUUID(), milestoneId: m.id, position: i })),
  );
  const keepT = new Set(tasks.map((t) => t.id));

  const delT = [...existingT.keys()].filter((id) => !keepT.has(id));
  if (delT.length) await supabase.from("roadmap_tasks").delete().in("id", delT);
  const delM = [...existingM].filter((id) => !keepM.has(id));
  if (delM.length) await supabase.from("roadmap_milestones").delete().in("id", delM);

  if (milestones.length) {
    const { error } = await supabase.from("roadmap_milestones").upsert(
      milestones.map((m) => ({
        id: m.id,
        workspace_id: s.workspace_id,
        project_id: s.project_id,
        strategy_id: s.id,
        title: m.title,
        description: m.description,
        due_date: m.dueDate,
        position: m.position,
      })),
    );
    if (error) return { error: error.code === "42501" ? "forbidden" : "generic" };
  }
  if (tasks.length) {
    const { error } = await supabase.from("roadmap_tasks").upsert(
      tasks.map((t) => ({
        id: t.id,
        workspace_id: s.workspace_id,
        project_id: s.project_id,
        strategy_id: s.id,
        milestone_id: t.milestoneId,
        title: t.title,
        brief: t.brief,
        platform: t.platform,
        status: t.status,
        assignee_id: t.assigneeId,
        due_date: t.dueDate,
        position: t.position,
        post_id: existingT.get(t.id) ?? null,
      })),
    );
    if (error) return { error: error.message.includes("assignee_not_member") ? "assignee_not_member" : error.code === "42501" ? "forbidden" : "generic" };
  }
  return { ok: true };
}

/** Resumen de métricas (últimos 30 días) para el Estratega. YouTube queda fuera (sus políticas no permiten combinar ni derivar métricas ni compartirlas con terceros). */
export async function metricsSummary(supabase: Supabase, accounts: StrategyAccount[]) {
  const ids = accounts.filter((a) => a.platform !== "youtube").map((a) => a.id);
  if (!ids.length) return "";
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("account_metrics_daily")
    .select("social_account_id, day, followers, views, likes")
    .in("social_account_id", ids)
    .gte("day", since)
    .order("day");
  const lines: string[] = [];
  for (const a of accounts.filter((x) => ids.includes(x.id))) {
    const rows = (data ?? []).filter((r) => r.social_account_id === a.id);
    if (!rows.length) continue;
    const first = rows[0];
    const last = rows.at(-1)!;
    lines.push(
      `${a.platform} ${accountLabel(a)}: seguidores ${last.followers ?? "?"} (hace 30 días: ${first.followers ?? "?"}), views ${last.views ?? "?"}, likes ${last.likes ?? "?"}`,
    );
  }
  return lines.join("\n");
}
