import { describe, expect, it } from "vitest";
import { PLATFORMS, WARMUP_ISSUES } from "@/lib/strategy/schema";
import { currentPlanDay, isUnsafeWarmupText, overdueCount, planProgress, planStreak, sanitizeWarmupTasks, todayPendingCount } from "@/lib/strategy/warmup";
import { issueAdjustments, warmupTemplate } from "@/lib/strategy/warmup-templates";

describe("plantillas de calentamiento", () => {
  it.each(PLATFORMS)("%s: tareas en todos los días, en ES y EN, y todas seguras", (platform) => {
    for (const locale of ["es", "en"] as const) {
      for (const d of [7, 10, 14]) {
        const tasks = warmupTemplate(platform, d, "cocina", locale);
        const days = new Set(tasks.map((t) => t.day));
        for (let i = 1; i <= d; i++) expect(days.has(i)).toBe(true);
        expect(Math.max(...tasks.map((t) => t.day))).toBe(d);
        // Las propias plantillas pasan el filtro de seguridad.
        expect(sanitizeWarmupTasks(tasks, d)).toHaveLength(tasks.length);
        // Frecuencia sana: como mucho 1 publicación al día.
        for (let i = 1; i <= d; i++) expect(tasks.filter((t) => t.day === i && t.category === "content" && t.targetCount === 1).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("los ajustes por problema son seguros, no se duplican y caen dentro del plan", () => {
    const extra = issueAdjustments([...WARMUP_ISSUES], { platform: "tiktok", niche: "", locale: "es", fromDay: 12, durationDays: 14, existingTitles: [] });
    expect(extra.length).toBeGreaterThan(5);
    expect(extra.every((t) => t.day >= 12 && t.day <= 14)).toBe(true);
    expect(sanitizeWarmupTasks(extra, 14)).toHaveLength(extra.length);
    const again = issueAdjustments(["zero_views"], { platform: "tiktok", niche: "", locale: "es", fromDay: 1, durationDays: 14, existingTitles: extra.map((t) => t.title) });
    expect(again).toEqual([]);
  });
});

describe("filtro de seguridad (regla nº 1)", () => {
  it("bloquea automatización y prácticas prohibidas", () => {
    for (const s of [
      "Usa un bot para dar likes",
      "Automatiza los comentarios",
      "Activa el auto-follow",
      "Compra 500 seguidores para arrancar",
      "Buy 1000 followers",
      "Haz follow/unfollow a 200 cuentas",
      "Únete a un grupo de engagement",
      "Crea cuentas falsas para comentar",
      "Usa una VPN de EE. UU.",
      "Follow massively in your niche",
    ]) {
      expect(isUnsafeWarmupText(s), s).toBe(true);
    }
  });
  it("permite las mismas ideas en negativo", () => {
    for (const s of ["No compres seguidores", "Don't buy followers or likes", "Nunca uses bots", "Sin VPN ni proxies", "Avoid engagement pods", "Nada de seguir/dejar de seguir en masa"]) {
      expect(isUnsafeWarmupText(s), s).toBe(false);
    }
  });
  it("sanitiza días, longitudes y números", () => {
    const out = sanitizeWarmupTasks(
      [
        { day: 0, category: "engage", title: "  Comenta a mano  ", detail: "x", targetCount: 500 },
        { day: 30, category: "content", title: "Publica 1 vídeo", detail: "", targetCount: null },
        { day: 3, category: "engage", title: "Usa un bot", detail: "", targetCount: null },
      ],
      10,
    );
    expect(out).toEqual([
      { day: 1, category: "engage", title: "Comenta a mano", detail: "x", targetCount: 100 },
      { day: 10, category: "content", title: "Publica 1 vídeo", detail: "", targetCount: null },
    ]);
  });
});

describe("progreso, racha y pendientes", () => {
  const tasks = [
    { day: 1, done: true },
    { day: 1, done: true },
    { day: 2, done: true },
    { day: 3, done: false },
    { day: 4, done: true },
    { day: 5, done: false },
  ];
  it("día actual del plan", () => {
    expect(currentPlanDay("2026-11-20", "2026-11-19", 7)).toBe(0);
    expect(currentPlanDay("2026-11-20", "2026-11-20", 7)).toBe(1);
    expect(currentPlanDay("2026-11-20", "2026-11-26", 7)).toBe(7);
    expect(currentPlanDay("2026-11-20", "2026-12-20", 7)).toBe(8);
  });
  it("progreso en %", () => {
    expect(planProgress(tasks)).toEqual({ done: 4, total: 6, percent: 67 });
    expect(planProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });
  it("racha: días seguidos completos hacia atrás desde hoy (o ayer si hoy no está completo)", () => {
    expect(planStreak(tasks, 2)).toBe(2); // días 1 y 2 completos
    expect(planStreak(tasks, 3)).toBe(2); // hoy (3) sin completar → cuenta desde ayer
    expect(planStreak(tasks, 5)).toBe(1); // solo el 4; el 3 rompe la racha
    expect(planStreak(tasks, 0)).toBe(0);
  });
  it("pendientes de días anteriores y de hoy", () => {
    expect(overdueCount(tasks, 5)).toBe(1);
    expect(todayPendingCount(tasks, 5)).toBe(1);
    expect(overdueCount(tasks, 1)).toBe(0);
  });
});
