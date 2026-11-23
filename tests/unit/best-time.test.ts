import { describe, expect, it } from "vitest";
import { bestHoursForWeekday, bestTimes, localSlot, MIN_SAMPLES, scoreAt, type HistoryPoint } from "@/lib/analytics/best-time";
import { zonedToUtc } from "@/lib/mcp/calendar";

const TZ = "Europe/Madrid";
/** Publicación el día `day` (YYYY-MM-DD) a la hora local `hour` con una puntuación. */
const at = (day: string, hour: number, score: number | null, proxy = false): HistoryPoint => ({ publishedAt: zonedToUtc(day, hour * 60, TZ).toISOString(), score, proxy });

describe("bestTimes · patrón por defecto", () => {
  it("sin historial devuelve el patrón orientativo con una rejilla 7×24 de 0 a 100", () => {
    const r = bestTimes("instagram", []);
    expect(r.source).toBe("default");
    expect(r.historyWeight).toBe(0);
    expect(r.grid).toHaveLength(7);
    expect(r.grid.every((row) => row.length === 24)).toBe(true);
    expect(Math.max(...r.grid.flat())).toBe(100);
    expect(r.notes).toContain("orientative");
    expect(r.notes).toContain("not_enough_history");
    // Madrugada floja, tarde fuerte.
    expect(r.grid[2][4]).toBeLessThan(r.grid[2][19]);
  });

  it("las mejores franjas no repiten horas contiguas del mismo día", () => {
    const r = bestTimes("tiktok", [], { top: 5 });
    expect(r.top).toHaveLength(5);
    for (let i = 0; i < r.top.length; i++)
      for (let j = i + 1; j < r.top.length; j++)
        expect(r.top[i].weekday === r.top[j].weekday && Math.abs(r.top[i].hour - r.top[j].hour) <= 1).toBe(false);
    expect(r.top[0].score).toBe(100);
  });

  it("por debajo del umbral de muestras ignora el historial", () => {
    const few = Array.from({ length: MIN_SAMPLES - 1 }, (_, i) => at("2026-11-02", 8, 1000 + i));
    const r = bestTimes("instagram", few);
    expect(r.source).toBe("default");
    expect(r.samples).toBe(MIN_SAMPLES - 1);
    expect(r.grid).toEqual(bestTimes("instagram", []).grid);
  });
});

describe("bestTimes · historial propio", () => {
  // Lunes 2 nov 2026 y siguientes lunes: a las 08:00 rinde mucho; a las 19:00, poco.
  const mondays = ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-10-26", "2026-10-19", "2026-10-12", "2026-10-05"];
  const history = [...mondays.map((d) => at(d, 8, 5000)), ...mondays.map((d) => at(d, 19, 500))];

  it("con suficientes muestras mezcla y sube las horas que mejor le funcionan al usuario", () => {
    const def = bestTimes("instagram", []);
    const r = bestTimes("instagram", history);
    expect(r.samples).toBe(16);
    expect(r.source).not.toBe("default");
    expect(r.historyWeight).toBeGreaterThan(0);
    // Lunes 08:00 gana posiciones frente al patrón; lunes 19:00 las pierde.
    expect(r.grid[0][8] - r.grid[0][19]).toBeGreaterThan(def.grid[0][8] - def.grid[0][19]);
    expect(r.grid[0][8]).toBeGreaterThan(r.grid[0][19]);
  });

  it("el peso del historial crece con las muestras y nunca pasa de 0,85", () => {
    const many = Array.from({ length: 400 }, (_, i) => at("2026-11-02", i % 24, 100 + (i % 7)));
    const small = bestTimes("tiktok", history);
    const big = bestTimes("tiktok", many);
    expect(big.historyWeight).toBeGreaterThan(small.historyWeight);
    expect(big.historyWeight).toBeLessThanOrEqual(0.85);
    expect(big.source).toBe("history");
  });

  it("descarta puntuaciones no válidas", () => {
    const r = bestTimes("instagram", [...history, at("2026-11-02", 9, null), at("2026-11-02", 9, -3), { publishedAt: "no-date", score: 10 }]);
    expect(r.samples).toBe(16);
  });

  it("YouTube: siempre solo el patrón orientativo (normas de la API)", () => {
    const r = bestTimes("youtube", history);
    expect(r.source).toBe("default");
    expect(r.samples).toBe(0);
    expect(r.notes).toContain("youtube_policy");
    expect(r.grid).toEqual(bestTimes("youtube", []).grid);
  });
});

describe("utilidades", () => {
  it("localSlot usa la zona horaria (lunes = 0)", () => {
    expect(localSlot(new Date("2026-11-23T18:30:00Z"), TZ)).toEqual({ weekday: 0, hour: 19 });
    expect(localSlot(new Date("2026-11-29T23:30:00Z"), TZ)).toEqual({ weekday: 0, hour: 0 }); // domingo UTC → lunes en Madrid
  });

  it("scoreAt y bestHoursForWeekday leen la rejilla", () => {
    const r = bestTimes("instagram", []);
    expect(scoreAt(r, zonedToUtc("2026-11-25", 19 * 60, TZ))).toBe(r.grid[2][19]);
    const hours = bestHoursForWeekday(r, 2, 2);
    expect(hours).toHaveLength(2);
    expect(hours[0].score).toBeGreaterThanOrEqual(hours[1].score);
  });
});
