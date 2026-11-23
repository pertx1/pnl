import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  combinedTotals,
  creditsSpent,
  dashboardBounds,
  dayIn,
  seriesDelta,
  statsByAccount,
  successRate,
  weekStrip,
  weeklyRhythm,
  type MetricRow,
} from "@/lib/dashboard/stats";

const row = (id: string, day: string, followers: number | null, views: number | null = null, likes: number | null = null): MetricRow => ({
  social_account_id: id,
  day,
  followers,
  views,
  likes,
});

describe("panel · fechas", () => {
  it("suma días a una clave de día", () => {
    expect(addDaysToKey("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("calcula el día en la zona horaria", () => {
    // 23:30 UTC del 23 = 00:30 del 24 en Madrid (invierno, UTC+1).
    expect(dayIn(new Date("2026-11-23T23:30:00Z"), "Europe/Madrid")).toBe("2026-11-24");
    expect(dayIn(new Date("2026-11-23T23:30:00Z"), "UTC")).toBe("2026-11-23");
  });
  it("devuelve límites coherentes", () => {
    const b = dashboardBounds(Date.parse("2026-11-23T10:00:00Z"), "UTC");
    expect(b.today).toBe("2026-11-23");
    expect(b.metricsSinceDay).toBe("2026-10-23");
    expect(b.in7Iso).toBe("2026-11-30T10:00:00.000Z");
  });
});

describe("panel · variaciones de seguidores", () => {
  const series = [
    { day: "2026-10-24", value: 100 },
    { day: "2026-11-10", value: 150 },
    { day: "2026-11-16", value: 170 },
    { day: "2026-11-23", value: 200 },
  ];
  it("compara con el dato de hace 7 y 30 días", () => {
    expect(seriesDelta(series, 7)).toBe(30);
    expect(seriesDelta(series, 30)).toBe(100);
  });
  it("sin histórico suficiente no inventa una variación", () => {
    expect(seriesDelta([{ day: "2026-11-22", value: 10 }, { day: "2026-11-23", value: 12 }], 7)).toBeUndefined();
    expect(seriesDelta([{ day: "2026-11-23", value: 12 }], 7)).toBeUndefined();
  });
  it("agrupa por cuenta, ordena y distingue cuentas sin datos", () => {
    const stats = statsByAccount(
      [
        { id: "a", platform: "tiktok" },
        { id: "b", platform: "instagram" },
      ],
      [row("a", "2026-11-23", 200, 5000, 300), row("a", "2026-11-16", 170, null, null)],
    );
    const a = stats.get("a")!;
    expect(a.hasData).toBe(true);
    expect(a.followers).toBe(200);
    expect(a.views).toBe(5000);
    expect(a.delta7).toBe(30);
    expect(a.series.map((p) => p.day)).toEqual(["2026-11-16", "2026-11-23"]);
    expect(stats.get("b")!.hasData).toBe(false);
    expect(stats.get("b")!.followers).toBeNull();
  });
});

describe("panel · total combinado sin YouTube", () => {
  const accounts = [
    { id: "tt", platform: "tiktok" },
    { id: "ig", platform: "instagram" },
    { id: "yt", platform: "youtube" },
  ];
  const metrics = [
    row("tt", "2026-11-16", 90, 1000, 10),
    row("tt", "2026-11-23", 100, 2000, 20),
    row("ig", "2026-11-16", 40, null, 5),
    row("ig", "2026-11-23", 50, null, 6),
    row("yt", "2026-11-16", 9000, 900000, 800),
    row("yt", "2026-11-23", 10000, 1000000, 900),
  ];
  it("nunca suma las cifras de YouTube", () => {
    const totals = combinedTotals(accounts, statsByAccount(accounts, metrics));
    expect(totals.accounts).toBe(2);
    expect(totals.followers).toBe(150);
    expect(totals.views).toBe(2000);
    expect(totals.likes).toBe(26);
    expect(totals.delta7).toBe(20);
  });
  it("si solo hay YouTube, no hay total", () => {
    const yt = [{ id: "yt", platform: "youtube" }];
    const totals = combinedTotals(yt, statsByAccount(yt, metrics));
    expect(totals.accounts).toBe(0);
    expect(totals.followers).toBeNull();
    expect(totals.delta7).toBeUndefined();
  });
  it("no suma variaciones si alguna cuenta aún no tiene histórico", () => {
    const m = [row("tt", "2026-11-16", 90), row("tt", "2026-11-23", 100), row("ig", "2026-11-23", 50)];
    const totals = combinedTotals(accounts, statsByAccount(accounts, m));
    expect(totals.followers).toBe(150);
    expect(totals.delta7).toBeUndefined();
  });
});

describe("panel · publicación y créditos", () => {
  it("reparte las publicaciones por semana", () => {
    const now = "2026-11-23T12:00:00Z";
    const r = weeklyRhythm(["2026-11-23T08:00:00Z", "2026-11-20T08:00:00Z", "2026-11-12T08:00:00Z", "2026-10-01T08:00:00Z"], now);
    expect(r.buckets).toEqual([0, 0, 1, 2]);
    expect(r.perWeek).toBe(0.75);
  });
  it("calcula el porcentaje de éxito", () => {
    expect(successRate(0, 0)).toBeNull();
    expect(successRate(9, 1)).toBe(90);
  });
  it("descuenta los reembolsos del gasto y no cuenta recargas", () => {
    expect(
      creditsSpent([
        { delta: -10, reason: "ai_generation" },
        { delta: -5, reason: "ai_generation" },
        { delta: 5, reason: "refund_ai_failure" },
        { delta: 1000, reason: "monthly_grant" },
      ]),
    ).toBe(10);
  });
});

describe("panel · tira de 7 días", () => {
  it("cuenta por día local empezando hoy", () => {
    const strip = weekStrip(["2026-11-23T18:00:00Z", "2026-11-23T23:30:00Z", "2026-11-29T10:00:00Z", "2026-12-05T10:00:00Z"], "2026-11-23T09:00:00Z", "Europe/Madrid");
    expect(strip).toHaveLength(7);
    expect(strip[0]).toEqual({ day: "2026-11-23", count: 1, isToday: true });
    expect(strip[1].count).toBe(1); // 00:30 del 24 en Madrid
    expect(strip[6]).toEqual({ day: "2026-11-29", count: 1, isToday: false });
  });
});
