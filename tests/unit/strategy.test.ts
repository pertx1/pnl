import { describe, expect, it } from "vitest";
import { addDaysIso, diffDaysIso, localIsoDay, localToUtcIso } from "@/lib/strategy/dates";
import { countByAccountDay, hasCrossAccountDuplicates, pillarSequence, planCalendar, type PlannerAccount } from "@/lib/strategy/planner";
import { strategyDocSchema, type Pillar } from "@/lib/strategy/schema";
import { STRATEGY_GOALS, strategyTemplate } from "@/lib/strategy/templates";

const pillars: Pillar[] = [
  { id: "a", name: "Enseñar", description: "Trucos", examples: ["Truco 1", "Truco 2"], share: 50 },
  { id: "b", name: "Detrás", description: "Proceso", examples: ["Proceso 1"], share: 30 },
  { id: "c", name: "Comunidad", description: "Preguntas", examples: ["Pregunta 1"], share: 20 },
];
const NOW = new Date("2026-11-20T08:00:00Z");
let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

describe("fechas", () => {
  it("suma y resta días de calendario", () => {
    expect(addDaysIso("2026-12-30", 3)).toBe("2027-01-02");
    expect(diffDaysIso("2026-03-01", "2026-02-27")).toBe(2);
  });
  it("convierte día + hora local a UTC con el desfase del navegador", () => {
    // Madrid en invierno: getTimezoneOffset() = -60
    expect(localToUtcIso("2026-11-20", 19, 0, -60)).toBe("2026-11-20T18:00:00.000Z");
    expect(localIsoDay(new Date("2026-11-20T23:30:00Z"), -60)).toBe("2026-11-21");
  });
});

describe("plantillas de estrategia", () => {
  it.each(STRATEGY_GOALS)("la plantilla %s es un documento válido en ES y EN", (goal) => {
    for (const locale of ["es", "en"] as const) {
      const doc = strategyTemplate(goal, locale, "2026-11-20", ["tiktok", "instagram"], newId);
      expect(strategyDocSchema.safeParse(doc).success).toBe(true);
      expect(doc.pillars.reduce((a, p) => a + p.share, 0)).toBe(100);
      expect(doc.milestones.length).toBeGreaterThan(0);
    }
  });
  it("no incluye tareas de redes que el ámbito no usa", () => {
    const doc = strategyTemplate("audience", "es", "2026-11-20", ["tiktok"], newId);
    const platforms = doc.milestones.flatMap((m) => m.tasks.map((t) => t.platform)).filter(Boolean);
    expect(platforms.every((p) => p === "tiktok")).toBe(true);
    expect(doc.frequency.map((f) => f.platform)).toEqual(["tiktok"]);
  });
});

describe("planificador", () => {
  it("reparte los pilares según su peso", () => {
    const seq = pillarSequence(pillars, 10);
    const count = (i: number) => seq.filter((x) => x === i).length;
    expect([count(0), count(1), count(2)]).toEqual([5, 3, 2]);
  });

  it("cuenta lo ya programado por cuenta y día UTC", () => {
    const m = countByAccountDay([
      { accountId: "x", scheduledAt: "2026-11-21T10:00:00.000Z" },
      { accountId: "x", scheduledAt: "2026-11-21T22:00:00.000Z" },
    ]);
    expect(m.get("x|2026-11-21")).toBe(2);
  });

  const base = {
    frequency: [
      { platform: "tiktok" as const, postsPerWeek: 7, hour: 19 },
      { platform: "instagram" as const, postsPerWeek: 3, hour: 13 },
    ],
    pillars,
    startDay: "2026-11-20",
    days: 14,
    tzOffsetMinutes: -60,
    locale: "es" as const,
    now: NOW,
  };

  it("nunca supera el límite diario contando lo ya programado", () => {
    const accounts: PlannerAccount[] = [{ id: "tt", platform: "tiktok", handle: "a", dailyLimit: 1 }];
    // Días 21 y 22 ya llenos en UTC.
    const existing = [
      { accountId: "tt", scheduledAt: "2026-11-21T18:00:00.000Z" },
      { accountId: "tt", scheduledAt: "2026-11-22T18:00:00.000Z" },
    ];
    const res = planCalendar({ ...base, accounts, existing });
    const counts = countByAccountDay([...existing, ...res.slots.map((s) => ({ accountId: s.accountId, scheduledAt: s.scheduledAt }))]);
    for (const v of counts.values()) expect(v).toBeLessThanOrEqual(1);
    expect(res.slots.some((s) => s.scheduledAt.startsWith("2026-11-21"))).toBe(false);
    // 14 deseadas, 2 días ocupados → 12 caben y 2 se informan como no colocadas.
    expect(res.slots).toHaveLength(12);
    expect(res.skipped).toEqual([{ accountId: "tt", count: 2 }]);
  });

  it("no propone nada en el pasado", () => {
    const accounts: PlannerAccount[] = [{ id: "tt", platform: "tiktok", handle: "a", dailyLimit: 3 }];
    const late = new Date("2026-11-20T20:00:00Z"); // ya pasó las 19:00 de Madrid
    const res = planCalendar({ ...base, accounts, existing: [], now: late });
    expect(res.slots.every((s) => new Date(s.scheduledAt).getTime() > late.getTime())).toBe(true);
  });

  it("respeta la frecuencia por red e ignora redes sin frecuencia", () => {
    const accounts: PlannerAccount[] = [
      { id: "ig", platform: "instagram", handle: "b", dailyLimit: 5 },
      { id: "yt", platform: "youtube", handle: "c", dailyLimit: 3 },
    ];
    const res = planCalendar({ ...base, accounts, existing: [] });
    expect(res.slots.filter((s) => s.accountId === "ig")).toHaveLength(6);
    expect(res.slots.filter((s) => s.accountId === "yt")).toHaveLength(0);
  });

  it("no repite el mismo texto entre cuentas distintas (anti-baneo)", () => {
    const accounts: PlannerAccount[] = [
      { id: "t1", platform: "tiktok", handle: "uno", dailyLimit: 3 },
      { id: "t2", platform: "tiktok", handle: "dos", dailyLimit: 3 },
      { id: "t3", platform: "tiktok", handle: "tres", dailyLimit: 3 },
    ];
    const onePillar: Pillar[] = [{ id: "p", name: "Único", description: "Desc", examples: ["Misma idea"], share: 100 }];
    const res = planCalendar({ ...base, pillars: onePillar, accounts, existing: [] });
    expect(res.slots.length).toBeGreaterThan(30);
    expect(hasCrossAccountDuplicates(res.slots)).toBe(false);
  });

  it("detecta textos duplicados entre cuentas (ignorando espacios y mayúsculas)", () => {
    expect(hasCrossAccountDuplicates([{ accountId: "a", caption: "Hola  mundo" }, { accountId: "b", caption: "hola mundo" }])).toBe(true);
    expect(hasCrossAccountDuplicates([{ accountId: "a", caption: "Hola" }, { accountId: "a", caption: "Hola" }])).toBe(false);
  });

  it("sin pilares no propone nada", () => {
    const res = planCalendar({ ...base, pillars: [], accounts: [{ id: "tt", platform: "tiktok", handle: null, dailyLimit: 3 }], existing: [] });
    expect(res.slots).toEqual([]);
  });
});
