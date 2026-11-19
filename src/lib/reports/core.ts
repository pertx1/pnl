/**
 * Lógica PURA de los informes (sin red ni BD): periodos, próxima ejecución, texto seguro para PDF,
 * colores de marca y agregados de métricas. Probada en tests/unit/commerce.test.ts.
 */

export type Frequency = "weekly" | "monthly";

const DAY = 86400000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Periodo cubierto por un envío: semanal = 7 días completos anteriores; mensual = mes natural anterior (UTC). */
export function periodFor(frequency: Frequency, now: Date): { since: string; until: string } {
  if (frequency === "weekly") {
    const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY);
    return { since: isoDay(new Date(until.getTime() - 6 * DAY)), until: isoDay(until) };
  }
  const firstThis = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const lastPrev = new Date(firstThis - DAY);
  return { since: isoDay(new Date(Date.UTC(lastPrev.getUTCFullYear(), lastPrev.getUTCMonth(), 1))), until: isoDay(lastPrev) };
}

/** Periodo de los últimos `days` días hasta hoy (descarga manual). */
export function lastDays(days: number, now: Date): { since: string; until: string } {
  const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { since: isoDay(new Date(until.getTime() - (days - 1) * DAY)), until: isoDay(until) };
}

/** Siguiente envío: lunes 07:00 UTC (semanal) o día 1 a las 07:00 UTC (mensual), estrictamente después de `from`. */
export function nextRunAt(frequency: Frequency, from: Date): Date {
  if (frequency === "weekly") {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 7));
    const dow = d.getUTCDay(); // 0 domingo, 1 lunes
    let add = (8 - dow) % 7;
    if (add === 0 && d.getTime() <= from.getTime()) add = 7;
    return new Date(d.getTime() + add * DAY);
  }
  let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1, 7));
  if (d.getTime() <= from.getTime()) d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1, 7));
  return d;
}

/** Texto apto para las fuentes estándar de PDF (WinAnsi): quita emojis y caracteres fuera de Latin-1 + tipografía común. */
export function pdfSafe(input: string | null | undefined, max = 500): string {
  if (!input) return "";
  const extra = new Set(["€", "‘", "’", "“", "”", "–", "—", "…", "•"]);
  let out = "";
  for (const ch of input.replace(/[\r\n\t]+/g, " ")) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || extra.has(ch)) out += ch;
  }
  out = out.replace(/\s{2,}/g, " ").trim();
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

/** "#C6F432" / "c6f432" / "#abc" → { r, g, b } en 0..1. */
export function hexToRgb01(hex: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = Number.parseInt(h, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/** Luminancia relativa (WCAG) para decidir texto claro u oscuro sobre el color de marca. */
export function luminance(c: { r: number; g: number; b: number }) {
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

export type MetricRow = { accountId: string; platform: string; day: string; followers: number | null; views: number | null; likes: number | null };

/**
 * KPIs del periodo. YouTube queda FUERA de los totales combinados (YouTube Developer Policies III.E.2 y III.E.4.h)
 * y se muestra solo por canal, tal cual lo da la API.
 */
export function aggregateMetrics(rows: MetricRow[], since: string, until: string) {
  const inRange = rows.filter((r) => r.day >= since && r.day <= until);
  const byAccount = new Map<string, MetricRow[]>();
  for (const r of inRange) {
    const arr = byAccount.get(r.accountId) ?? [];
    arr.push(r);
    byAccount.set(r.accountId, arr);
  }
  const accounts = [...byAccount.entries()].map(([accountId, arr]) => {
    arr.sort((a, b) => (a.day < b.day ? -1 : 1));
    const first = arr[0];
    const last = arr.at(-1)!;
    const growth = first.followers !== null && last.followers !== null ? last.followers - first.followers : null;
    return { accountId, platform: last.platform, followers: last.followers, views: last.views, likes: last.likes, growth };
  });
  const combinable = accounts.filter((a) => a.platform !== "youtube");
  const sum = (k: "followers" | "views" | "likes" | "growth") => {
    const vals = combinable.map((a) => a[k]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
  };
  const byDay = new Map<string, number>();
  for (const r of inRange) {
    if (r.platform === "youtube" || r.followers === null) continue;
    byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.followers);
  }
  return {
    totals: { followers: sum("followers"), views: sum("views"), likes: sum("likes"), growth: sum("growth") },
    accounts,
    hasYouTube: accounts.some((a) => a.platform === "youtube"),
    followersByDay: [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, value]) => ({ day, value })),
  };
}

/** Normaliza y deduplica destinatarios (máx. 10). Devuelve null si alguno no es un email válido. */
export function parseRecipients(input: string): string[] | null {
  const list = [...new Set(input.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (!list.length || list.length > 10) return null;
  return list.every((e) => e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) ? list : null;
}
