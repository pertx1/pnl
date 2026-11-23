/**
 * Panel general (inicio): agregados por proyecto para todos los proyectos del workspace.
 * Funciones puras (sin Supabase ni React) con tests en tests/unit/home.test.ts.
 */
import { zonedToUtc } from "@/lib/mcp/calendar";
import { addDaysToKey, dashboardBounds, DEFAULT_TZ } from "./stats";

/** Límites del inicio: los del panel de proyecto + inicio de hoy y fin de la semana (7 días desde hoy) en la zona dada. */
export function homeBounds(now: number = Date.now(), timeZone: string = DEFAULT_TZ) {
  const b = dashboardBounds(now, timeZone);
  const weekEndDay = addDaysToKey(b.today, 7);
  return {
    ...b,
    nowMs: now,
    todayStartIso: zonedToUtc(b.today, 0, timeZone).toISOString(),
    tomorrowStartIso: zonedToUtc(addDaysToKey(b.today, 1), 0, timeZone).toISOString(),
    weekEndIso: zonedToUtc(weekEndDay, 0, timeZone).toISOString(),
    weekLastDay: addDaysToKey(b.today, 6),
  };
}

/** Cuenta filas por proyecto. */
export function countByProject<T>(rows: T[], projectOf: (row: T) => string | null | undefined) {
  const out = new Map<string, number>();
  for (const r of rows) {
    const id = projectOf(r);
    if (id) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/** Primer elemento por proyecto de una lista ya ordenada (p. ej. la próxima publicación). */
export function firstByProject<T extends { project_id: string }>(rows: T[]) {
  const out = new Map<string, T>();
  for (const r of rows) if (!out.has(r.project_id)) out.set(r.project_id, r);
  return out;
}

/** Desglose por proyecto (en el orden de `projects`, solo los que tienen algo) y total. */
export function breakdown(projects: { id: string; name: string }[], counts: Map<string, number>) {
  const rows = projects.map((p, index) => ({ id: p.id, name: p.name, index, count: counts.get(p.id) ?? 0 })).filter((r) => r.count > 0);
  return { total: rows.reduce((a, r) => a + r.count, 0), rows };
}

/** Tareas abiertas que vencen hoy o antes, separadas en vencidas y de hoy. */
export function tasksDue(tasks: { project_id: string; due_date: string | null }[], today: string) {
  const due = tasks.filter((t) => t.due_date && t.due_date <= today);
  return { due, overdue: due.filter((t) => t.due_date! < today).length };
}
