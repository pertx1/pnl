/**
 * «Programar clips» (lógica pura): reparte clips en los próximos huecos libres del calendario y limpia los textos por red.
 * Los huecos salen de computeFreeSlots (src/lib/mcp/calendar.ts), que ya respeta el límite diario de cada cuenta
 * (anti-baneo) y la hora local. Aquí solo se elige día y hora para cada clip; lo que se crea son BORRADORES que una
 * persona revisa y aprueba (nada se publica solo).
 */
import { hhmm, zonedToUtc, type FreeDay } from "@/lib/mcp/calendar";
import { ytTagsLength } from "@/lib/posts/rules";

export type ClipSlot = { clipId: string; day: string; time: string; scheduledAt: string };

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Asigna cada clip (en el orden recibido: el mejor primero) al primer día con capacidad en TODAS las cuentas elegidas
 * (cada clip es una publicación con todas esas cuentas como destino). Como máximo `perDay` clips al día y nunca más de lo
 * que permita el límite diario restante de la cuenta más ajustada. La hora es la sugerida para la cuenta (estrategia u
 * hora habitual de la red) o la más cercana dentro de las franjas libres, con `gapMinutes` de separación entre clips.
 */
export function planClipSchedule(o: { clipIds: string[]; days: FreeDay[]; accountIds: string[]; perDay: number; tz: string; gapMinutes?: number; minWindowMinutes?: number }): {
  slots: ClipSlot[];
  unscheduled: string[];
} {
  const gap = o.gapMinutes ?? 120;
  const minWindow = o.minWindowMinutes ?? 30;
  const perDay = Math.max(1, Math.min(5, Math.floor(o.perDay)));
  const queue = [...o.clipIds];
  const slots: ClipSlot[] = [];
  if (!o.accountIds.length) return { slots, unscheduled: queue };

  for (const day of [...o.days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!queue.length) break;
    const accs = o.accountIds.map((id) => day.accounts.find((a) => a.account_id === id));
    if (accs.some((a) => !a)) continue; // cuenta sin datos ese día → no se arriesga
    const capacity = Math.min(perDay, ...accs.map((a) => a!.remaining));
    if (capacity <= 0) continue;

    let windows = day.free_windows.map((w) => ({ start: toMin(w.start), end: toMin(w.end) })).filter((w) => w.end - w.start >= minWindow);
    const suggested = accs.map((a) => a!.suggested_time).find((x): x is string => Boolean(x));
    const pref = suggested ? toMin(suggested) : windows[0]?.start;
    if (pref === undefined) continue;

    for (let n = 0; n < capacity && queue.length && windows.length; n++) {
      let best: { at: number; dist: number } | null = null;
      for (const w of windows) {
        const at = Math.ceil(Math.min(Math.max(pref, w.start), w.end - minWindow) / 15) * 15;
        if (at < w.start || at > w.end) continue;
        const dist = Math.abs(at - pref);
        if (!best || dist < best.dist) best = { at, dist };
      }
      if (!best) break;
      const clipId = queue.shift()!;
      const time = hhmm(best.at);
      slots.push({ clipId, day: day.date, time, scheduledAt: zonedToUtc(day.date, best.at, o.tz).toISOString() });
      // Quita la franja ocupada (± gap) para el siguiente clip del mismo día.
      const cutFrom = best.at - gap;
      const cutTo = best.at + gap;
      windows = windows
        .flatMap((w) => [
          { start: w.start, end: Math.min(w.end, cutFrom) },
          { start: Math.max(w.start, cutTo), end: w.end },
        ])
        .filter((w) => w.end - w.start >= minWindow);
    }
  }
  return { slots, unscheduled: queue };
}

export type ClipCopy = {
  tiktok: string;
  instagram: string;
  youtubeTitle: string;
  youtubeDescription: string;
  youtubeTags: string[];
};

/** Recorta y limpia los textos que propone la IA a los límites de cada red (ver src/lib/posts/rules.ts). */
export function normalizeClipCopy(raw: Partial<Record<keyof ClipCopy, unknown>>, fallbackTitle: string): ClipCopy {
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const t of Array.isArray(raw.youtubeTags) ? raw.youtubeTags : []) {
    const tag = String(t ?? "")
      .replace(/^#/, "")
      .replace(/[<>,"]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    if (ytTagsLength([...tags, tag]) > 450 || tags.length >= 15) break; // margen bajo el máximo de 500 de YouTube
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  const title = str(raw.youtubeTitle, 100) || fallbackTitle.trim().slice(0, 100) || "Clip";
  return {
    tiktok: str(raw.tiktok, 2200),
    instagram: str(raw.instagram, 2200),
    youtubeTitle: title.replace(/[<>]/g, ""),
    youtubeDescription: str(raw.youtubeDescription, 5000).replace(/[<>]/g, ""),
    youtubeTags: tags,
  };
}

/** Créditos de los textos por red: 1 por clip (mismo precio que las sugerencias de caption del editor). */
export function clipCopyCredits(clips: number) {
  return Math.max(1, clips);
}
