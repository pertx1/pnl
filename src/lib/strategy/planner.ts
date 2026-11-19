import { addDaysIso, localToUtcIso } from "./dates";
import type { Frequency, Pillar, Platform } from "./schema";

/**
 * Planificador (lógica pura, sin IA): reparte BORRADORES en las próximas N semanas según la frecuencia por red y
 * los pilares, respetando el límite diario de cada cuenta (daily_post_limit) contando lo que ya hay en el calendario.
 *
 * El día se cuenta en UTC, igual que `public.post_limit_violations` (así lo que se propone aquí pasará después la
 * comprobación de `approve_post`). A diferencia de esa función, aquí contamos TAMBIÉN borradores y pendientes
 * (criterio más conservador: no llenar un día que ya tiene cosas en preparación).
 */
export type PlannerAccount = { id: string; platform: Platform; handle: string | null; dailyLimit: number };
export type ExistingPost = { accountId: string; scheduledAt: string };
export type PlannedSlot = {
  key: string;
  accountId: string;
  platform: Platform;
  handle: string | null;
  localDay: string;
  scheduledAt: string;
  pillarId: string;
  pillarName: string;
  idea: string;
  title: string;
  caption: string;
};
export type PlannerResult = { slots: PlannedSlot[]; skipped: { accountId: string; count: number }[] };

type Locale = "es" | "en";

const CTAS: Record<Locale, Record<Platform, string[]>> = {
  es: {
    tiktok: ["Sígueme para la parte 2.", "¿Te ha pasado? Cuéntamelo en comentarios.", "Guárdalo para luego."],
    instagram: ["Guárdalo para tenerlo a mano.", "Compártelo con quien lo necesite.", "¿Qué añadirías tú? Te leo."],
    youtube: ["Más detalles en la descripción.", "Dime en comentarios qué vídeo quieres después.", "Suscríbete si te ha sido útil."],
  },
  en: {
    tiktok: ["Follow for part 2.", "Has this happened to you? Tell me in the comments.", "Save it for later."],
    instagram: ["Save it so you have it handy.", "Share it with someone who needs it.", "What would you add? I read every reply."],
    youtube: ["More details in the description.", "Tell me in the comments what video you want next.", "Subscribe if this helped."],
  },
};

const ANGLES: Record<Locale, string[]> = {
  es: ["", "Versión rápida: ", "Mi experiencia: ", "Paso a paso: ", "Lo que nadie cuenta: ", "En 30 segundos: "],
  en: ["", "Quick version: ", "My experience: ", "Step by step: ", "What nobody tells you: ", "In 30 seconds: "],
};

/** Secuencia de pilares proporcional a su peso (round-robin con déficit). Pilares con peso 0 cuentan como 1. */
export function pillarSequence(pillars: Pillar[], total: number): number[] {
  if (!pillars.length || total <= 0) return [];
  const weights = pillars.map((p) => Math.max(1, p.share));
  const sum = weights.reduce((a, b) => a + b, 0);
  const credit = weights.map(() => 0);
  const seq: number[] = [];
  for (let i = 0; i < total; i++) {
    for (let j = 0; j < weights.length; j++) credit[j] += weights[j] / sum;
    let best = 0;
    for (let j = 1; j < weights.length; j++) if (credit[j] > credit[best]) best = j;
    credit[best] -= 1;
    seq.push(best);
  }
  return seq;
}

/** Publicaciones ya existentes por cuenta y día UTC. */
export function countByAccountDay(existing: ExistingPost[]) {
  const m = new Map<string, number>();
  for (const e of existing) {
    const k = `${e.accountId}|${e.scheduledAt.slice(0, 10)}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function buildCaption(locale: Locale, platform: Platform, idea: string, pillar: Pillar, variant: number) {
  const ctas = CTAS[locale][platform];
  const angle = ANGLES[locale][variant % ANGLES[locale].length];
  const cta = ctas[Math.floor(variant / ANGLES[locale].length) % ctas.length]; // 6 ángulos × 3 CTA = 18 combinaciones distintas
  return [`${angle}${idea}`.trim(), pillar.description.trim(), cta].filter(Boolean).join("\n\n");
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** ¿Hay el mismo texto en dos cuentas distintas? (anti-baneo: nunca contenido idéntico entre cuentas). */
export function hasCrossAccountDuplicates(slots: Pick<PlannedSlot, "accountId" | "caption">[]) {
  const owner = new Map<string, string>();
  for (const s of slots) {
    const k = norm(s.caption);
    const prev = owner.get(k);
    if (prev && prev !== s.accountId) return true;
    if (!prev) owner.set(k, s.accountId);
  }
  return false;
}

export function planCalendar(input: {
  accounts: PlannerAccount[];
  frequency: Frequency[];
  pillars: Pillar[];
  startDay: string; // día local de inicio (YYYY-MM-DD)
  days: number;
  tzOffsetMinutes: number;
  existing: ExistingPost[];
  locale: Locale;
  now: Date;
}): PlannerResult {
  const { accounts, frequency, pillars, startDay, days, tzOffsetMinutes, locale } = input;
  const counts = countByAccountDay(input.existing);
  const slots: PlannedSlot[] = [];
  const skipped: { accountId: string; count: number }[] = [];
  if (!pillars.length) return { slots, skipped };
  const usedCaptions = new Map<string, string>(); // caption normalizado → cuenta
  const pillarUses = new Map<string, number>();

  accounts.forEach((acc, accIdx) => {
    const f = frequency.find((x) => x.platform === acc.platform);
    if (!f || f.postsPerWeek <= 0) return;
    const wanted = Math.round((f.postsPerWeek * days) / 7);
    const minute = (accIdx * 17) % 60; // horas escalonadas entre cuentas
    const seq = pillarSequence(pillars, wanted);
    const rotate = accIdx % pillars.length;
    let missed = 0;

    for (let i = 0; i < wanted; i++) {
      const ideal = Math.floor((i * days) / wanted);
      let placed: { day: string; at: string } | null = null;
      for (let step = 0; step < days && !placed; step++) {
        const d = (ideal + step) % days;
        const day = addDaysIso(startDay, d);
        const at = localToUtcIso(day, f.hour, minute, tzOffsetMinutes);
        if (new Date(at).getTime() <= input.now.getTime() + 30 * 60000) continue; // nunca en el pasado
        const key = `${acc.id}|${at.slice(0, 10)}`;
        if ((counts.get(key) ?? 0) >= acc.dailyLimit) continue;
        // Una sola publicación propuesta por cuenta y día local (frecuencia sana) salvo que se pidan más de 7/semana.
        if (f.postsPerWeek <= 7 && slots.some((s) => s.accountId === acc.id && s.localDay === day)) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        placed = { day, at };
      }
      if (!placed) {
        missed++;
        continue;
      }
      const pillar = pillars[(seq[i] + rotate) % pillars.length];
      const uses = pillarUses.get(`${acc.id}|${pillar.id}`) ?? 0;
      pillarUses.set(`${acc.id}|${pillar.id}`, uses + 1);
      const examples = pillar.examples.length ? pillar.examples : [pillar.name];
      const idea = examples[(uses + accIdx) % examples.length];

      // Texto distinto entre cuentas: probamos ángulos/CTA hasta que no coincida con el de otra cuenta.
      let caption = "";
      for (let v = accIdx + i, tries = 0; tries < 18; v++, tries++) {
        caption = buildCaption(locale, acc.platform, idea, pillar, v);
        const owner = usedCaptions.get(norm(caption));
        if (!owner || owner === acc.id) break;
      }
      if (!usedCaptions.has(norm(caption))) usedCaptions.set(norm(caption), acc.id);

      slots.push({
        key: `${acc.id}:${placed.day}:${i}`,
        accountId: acc.id,
        platform: acc.platform,
        handle: acc.handle,
        localDay: placed.day,
        scheduledAt: placed.at,
        pillarId: pillar.id,
        pillarName: pillar.name,
        idea,
        title: `${pillar.name}: ${idea}`.slice(0, 120),
        caption,
      });
    }
    if (missed) skipped.push({ accountId: acc.id, count: missed });
  });

  slots.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return { slots, skipped };
}
