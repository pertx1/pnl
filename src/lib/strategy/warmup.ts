import { diffDaysIso } from "./dates";
import type { WarmupTaskDraft } from "./schema";

/** Lógica pura del calentamiento: día actual, progreso, racha, pendientes y filtro de seguridad de tareas. */
export type WarmupTaskState = { day: number; done: boolean };

/** Día del plan (1..duración). 0 = aún no ha empezado; duración + 1 = terminado. */
export function currentPlanDay(startDate: string, today: string, durationDays: number) {
  const d = diffDaysIso(today, startDate) + 1;
  if (d < 1) return 0;
  return Math.min(d, durationDays + 1);
}

export function planProgress(tasks: WarmupTaskState[]) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

function dayComplete(tasks: WarmupTaskState[], day: number) {
  const ofDay = tasks.filter((t) => t.day === day);
  return ofDay.length > 0 && ofDay.every((t) => t.done);
}

/**
 * Racha: días seguidos con TODAS sus tareas hechas, contando hacia atrás desde hoy (si hoy ya está completo)
 * o desde ayer (si hoy aún no). Los días sin tareas no rompen la racha ni suman.
 */
export function planStreak(tasks: WarmupTaskState[], currentDay: number) {
  if (currentDay < 1) return 0;
  const last = Math.min(currentDay, Math.max(0, ...tasks.map((t) => t.day)));
  let day = dayComplete(tasks, last) ? last : last - 1;
  let streak = 0;
  for (; day >= 1; day--) {
    const ofDay = tasks.filter((t) => t.day === day);
    if (!ofDay.length) continue;
    if (!ofDay.every((t) => t.done)) break;
    streak++;
  }
  return streak;
}

/** Tareas sin hacer de días anteriores a hoy (para el aviso dentro de la app y el recordatorio). */
export function overdueCount(tasks: WarmupTaskState[], currentDay: number) {
  return tasks.filter((t) => !t.done && t.day < currentDay).length;
}

/** Tareas de hoy sin hacer. */
export function todayPendingCount(tasks: WarmupTaskState[], currentDay: number) {
  return tasks.filter((t) => !t.done && t.day === currentDay).length;
}

// -----------------------------------------------------------------------------------------------
// Filtro de seguridad (regla nº 1): nada de automatización ni prácticas que rompen las normas de las plataformas.
// Se aplica a TODO lo que propone la IA antes de guardarlo. Las frases en negativo ("no compres seguidores") se permiten.
// -----------------------------------------------------------------------------------------------
const FORBIDDEN = [
  /\bbots?\b/i,
  /automati[sz]/i,
  /automatiz/i,
  /\bauto[- ]?(follow|like|comment|dm|reply)/i,
  /\b(buy|purchase)\w*\s+(\w+\s+)?(followers|likes|views|comments|engagement)/i,
  /\bcompra\w*\s+(\w+\s+)?(seguidores|likes|me gusta|visualizaciones|views|comentarios)/i,
  /follow\s*\/\s*unfollow|seguir\s*\/\s*dejar de seguir|follow[- ]for[- ]follow|follow4follow|f4f|sub4sub/i,
  /engagement (pods?|groups?)|grupos? de engagement|pods? de engagement/i,
  /\b(fake|falsas?|secundarias?) (accounts?|cuentas?)|cuentas? (falsas?|fake)/i,
  /\bscrap/i,
  /\b(mass\w*|masiv\w*|en masa)\b/i,
  /\b(usa|use|activa|enable|conecta)\w*\s+(una\s+|a\s+)?(vpn|proxy|proxies)/i,
];
const NEGATION = /\b(no|nunca|never|don'?t|do not|avoid|evita\w*|ni|without|sin|nada de|not)\b/i;

export function isUnsafeWarmupText(text: string) {
  for (const re of FORBIDDEN) {
    const m = re.exec(text);
    if (!m) continue;
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    if (!NEGATION.test(before)) return true;
  }
  return false;
}

export function sanitizeWarmupTasks(tasks: WarmupTaskDraft[], durationDays: number) {
  return tasks
    .filter((t) => !isUnsafeWarmupText(`${t.title} ${t.detail}`))
    .map((t) => ({
      ...t,
      day: Math.min(durationDays, Math.max(1, Math.round(t.day))),
      title: t.title.trim().slice(0, 200),
      detail: t.detail.trim().slice(0, 1000),
      targetCount: t.targetCount === null ? null : Math.min(100, Math.max(0, Math.round(t.targetCount))),
    }))
    .filter((t) => t.title.length > 0);
}
