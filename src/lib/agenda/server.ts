import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AgendaBlockRow } from "@/lib/supabase/types/agenda";
import { zonedParts, zonedToUtc } from "@/lib/mcp/calendar";
import { addDays, DEFAULT_DAY, estimateMinutes, type DaySettings, type PlanItem } from "./core";

type Db = SupabaseClient<Database>;

/** ¿El error es «la tabla no existe» (migración aún sin aplicar)? */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /does not exist|schema cache/i.test(error.message ?? "");
}

export type AgendaData = { available: boolean; settings: DaySettings; blocks: AgendaBlockRow[] };

/**
 * Jornada y bloques del usuario que pueden ocurrir entre `from` y `to`.
 * Con el cliente del usuario RLS ya limita a sus bloques; con el cliente de servicio (MCP) se filtra por `userId`.
 * Si la migración de la agenda no está aplicada, devuelve `available: false` y la UI lo indica sin romperse.
 */
export async function loadAgenda(db: Db, o: { userId: string; from: string; to: string }): Promise<AgendaData> {
  const [settingsRes, blocksRes] = await Promise.all([
    db.from("agenda_settings").select("day_start_minute, day_end_minute, timezone").eq("user_id", o.userId).maybeSingle(),
    db
      .from("agenda_blocks")
      .select("*")
      .eq("user_id", o.userId)
      .lte("start_day", o.to)
      .or(`end_day.is.null,end_day.gte.${o.from}`)
      .order("start_minute")
      .limit(500),
  ]);
  if (isMissingTable(blocksRes.error) || isMissingTable(settingsRes.error)) {
    return { available: false, settings: { ...DEFAULT_DAY }, blocks: [] };
  }
  const s = settingsRes.data;
  return {
    available: !blocksRes.error,
    settings: s ? { startMinute: s.day_start_minute, endMinute: s.day_end_minute, timezone: s.timezone } : { ...DEFAULT_DAY },
    blocks: blocksRes.data ?? [],
  };
}

/** Solo la jornada del usuario (para saber su zona horaria antes de calcular un rango). */
export async function loadAgendaSettings(db: Db, userId: string): Promise<{ available: boolean; settings: DaySettings }> {
  const { data: s, error } = await db.from("agenda_settings").select("day_start_minute, day_end_minute, timezone").eq("user_id", userId).maybeSingle();
  if (isMissingTable(error)) return { available: false, settings: { ...DEFAULT_DAY } };
  return { available: !error, settings: s ? { startMinute: s.day_start_minute, endMinute: s.day_end_minute, timezone: s.timezone } : { ...DEFAULT_DAY } };
}

export type PlanCandidate = PlanItem & { projectName: string | null; scheduledAt?: string | null };

/**
 * Lo que se puede repartir: tareas abiertas del roadmap (con fecha hasta `horizon` o sin fecha) y borradores
 * con fecha entre ahora y `horizon` (necesitan preparación). Omite lo que ya tiene un bloque en la agenda.
 */
export async function loadPlanCandidates(
  db: Db,
  o: { projectIds: string[]; projectNames: Map<string, string>; nowIso: string; horizon: string; timezone: string; alreadyPlanned: { taskIds: Set<string>; postIds: Set<string> } },
): Promise<PlanCandidate[]> {
  if (!o.projectIds.length) return [];
  const horizonEnd = zonedToUtc(addDays(o.horizon, 1), 0, o.timezone).toISOString();
  const [{ data: tasks }, { data: drafts }] = await Promise.all([
    db
      .from("roadmap_tasks")
      .select("id, project_id, title, due_date, status")
      .in("project_id", o.projectIds)
      .neq("status", "done")
      .or(`due_date.is.null,due_date.lte.${o.horizon}`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(60),
    db
      .from("posts")
      .select("id, project_id, title, caption, scheduled_at")
      .in("project_id", o.projectIds)
      .eq("status", "draft")
      .gte("scheduled_at", o.nowIso)
      .lt("scheduled_at", horizonEnd)
      .order("scheduled_at")
      .limit(40),
  ]);
  const out: PlanCandidate[] = [];
  for (const t of tasks ?? []) {
    if (o.alreadyPlanned.taskIds.has(t.id)) continue;
    out.push({
      id: `task:${t.id}`,
      type: "task",
      title: t.title,
      projectId: t.project_id,
      projectName: o.projectNames.get(t.project_id) ?? null,
      due: t.due_date,
      minutes: estimateMinutes(t.title, "task"),
      taskId: t.id,
    });
  }
  for (const p of drafts ?? []) {
    if (o.alreadyPlanned.postIds.has(p.id)) continue;
    const title = p.title?.trim() || p.caption.trim().slice(0, 80) || "—";
    out.push({
      id: `post:${p.id}`,
      type: "post",
      title,
      projectId: p.project_id,
      projectName: o.projectNames.get(p.project_id) ?? null,
      due: p.scheduled_at ? zonedParts(new Date(p.scheduled_at), o.timezone).day : null,
      minutes: estimateMinutes(title, "post"),
      postId: p.id,
      scheduledAt: p.scheduled_at,
    });
  }
  return out;
}
