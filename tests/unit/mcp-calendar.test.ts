import { describe, expect, it } from "vitest";
import { computeFreeSlots, daysBetween, isIsoDay, isValidTimeZone, zonedParts, zonedToUtc } from "@/lib/mcp/calendar";

describe("zonas horarias", () => {
  it("convierte horas locales de Madrid a UTC con y sin horario de verano", () => {
    expect(zonedToUtc("2026-07-01", 0, "Europe/Madrid").toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(zonedToUtc("2026-12-01", 19 * 60, "Europe/Madrid").toISOString()).toBe("2026-12-01T18:00:00.000Z");
    expect(zonedParts(new Date("2026-12-01T18:00:00Z"), "Europe/Madrid")).toMatchObject({ day: "2026-12-01", time: "19:00" });
  });
  it("valida días y zonas", () => {
    expect(isIsoDay("2026-02-30")).toBe(false);
    expect(isIsoDay("2026-11-23")).toBe(true);
    expect(isValidTimeZone("Europe/Madrid")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(daysBetween("2026-11-29", "2026-12-02")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
  });
});

describe("huecos libres", () => {
  const now = new Date("2026-11-23T07:00:00Z"); // 08:00 en Madrid
  const acc = { id: "a1", platform: "tiktok", handle: "@kreo", dailyLimit: 2, preferredHour: 19 };

  it("día sin publicaciones: todo libre y hora sugerida la preferida", () => {
    const [d] = computeFreeSlots({ days: ["2026-11-24"], tz: "Europe/Madrid", now, accounts: [acc], posts: [] });
    expect(d.completely_free).toBe(true);
    expect(d.free_windows).toEqual([{ start: "08:00", end: "22:00" }]);
    expect(d.accounts[0]).toMatchObject({ planned: 0, remaining: 2, suggested_time: "19:00" });
  });

  it("resta 1 h alrededor de cada publicación y respeta el límite diario", () => {
    const posts = [
      { scheduledAt: "2026-11-24T18:00:00Z", status: "scheduled", accountIds: ["a1"] }, // 19:00 Madrid
      { scheduledAt: "2026-11-24T11:00:00Z", status: "pending_approval", accountIds: ["a1"] }, // 12:00
      { scheduledAt: "2026-11-24T15:00:00Z", status: "draft", accountIds: ["a1"] }, // 16:00 (borrador)
    ];
    const [d] = computeFreeSlots({ days: ["2026-11-24"], tz: "Europe/Madrid", now, accounts: [acc], posts });
    expect(d.busy_times).toEqual(["12:00", "16:00", "19:00"]);
    expect(d.free_windows).toEqual([
      { start: "08:00", end: "11:00" },
      { start: "13:00", end: "15:00" },
      { start: "17:00", end: "18:00" },
      { start: "20:00", end: "22:00" },
    ]);
    expect(d.accounts[0]).toMatchObject({ planned: 2, drafts: 1, remaining: 0, suggested_time: null });
  });

  it("omite días pasados y hoy empieza después de la hora actual", () => {
    const days = computeFreeSlots({ days: ["2026-11-22", "2026-11-23"], tz: "Europe/Madrid", now: new Date("2026-11-23T13:10:00Z"), accounts: [acc], posts: [] });
    expect(days).toHaveLength(1);
    expect(days[0].free_windows[0].start).toBe("14:30");
  });

  it("tiene en cuenta el día UTC con el que se comprueba el límite al aprobar", () => {
    // Nueva York (UTC-5): las 20:00 del 24 son las 01:00 UTC del 25. Ese día UTC ya tiene 2 publicaciones (límite 2)
    // aunque en el día local 24 no haya ninguna.
    const ny = { ...acc, preferredHour: 20 };
    const posts = [
      { scheduledAt: "2026-11-25T02:00:00Z", status: "scheduled", accountIds: ["a1"] }, // 21:00 del 24 en NY → pero mismo día UTC 25
      { scheduledAt: "2026-11-25T20:00:00Z", status: "approved", accountIds: ["a1"] }, // 15:00 del 25 en NY
    ];
    const [d] = computeFreeSlots({ days: ["2026-11-24"], tz: "America/New_York", now, accounts: [ny], posts, windowEndHour: 24 });
    expect(d.accounts[0].planned).toBe(1); // solo la de las 21:00 cae en el día local 24
    // Hora sugerida cercana a las 20:00 locales → día UTC 25, que ya está lleno.
    expect(d.accounts[0]).toMatchObject({ remaining: 0, suggested_time: null });
  });

  it("sugiere la franja libre más cercana a la hora preferida", () => {
    const posts = [{ scheduledAt: "2026-11-24T18:00:00Z", status: "approved", accountIds: ["other"] }];
    const [d] = computeFreeSlots({ days: ["2026-11-24"], tz: "Europe/Madrid", now, accounts: [{ ...acc, dailyLimit: 3 }], posts });
    expect(d.accounts[0]).toMatchObject({ planned: 0, remaining: 3 });
    expect(["18:00", "20:00"]).toContain(d.accounts[0].suggested_time);
  });
});

describe("huecos libres ordenados por mejores horas", () => {
  const now = new Date("2026-11-23T07:00:00Z"); // lunes 08:00 en Madrid
  const acc = { id: "a1", platform: "instagram", handle: "@kreo", dailyLimit: 2, preferredHour: 19 };
  // Rejilla 7×24: el martes (índice 1) puntúa más a las 10:00, luego a las 15:00.
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 10));
  grid[1][10] = 100;
  grid[1][15] = 80;

  it("sin puntuación se comporta igual que antes (sin ranked_times)", () => {
    const [d] = computeFreeSlots({ days: ["2026-11-24"], tz: "Europe/Madrid", now, accounts: [acc], posts: [] });
    expect(d.accounts[0].suggested_time).toBe("19:00");
    expect(d.accounts[0].ranked_times).toBeUndefined();
  });

  it("con puntuación sugiere la hora libre con mejor puntuación y ordena las alternativas", () => {
    const [d] = computeFreeSlots({ days: ["2026-11-24"], tz: "Europe/Madrid", now, accounts: [{ ...acc, hourScores: grid }], posts: [] });
    expect(d.accounts[0].suggested_time).toBe("10:30"); // empate 10:00/10:30 → la más cercana a las 19:00
    expect(d.accounts[0].ranked_times?.slice(0, 2)).toEqual(["10:30", "15:30"]);
    expect(d.accounts[0].best_time_score).toBe(100);
  });

  it("respeta las franjas ocupadas: si la mejor hora está ocupada, pasa a la siguiente", () => {
    const posts = [{ scheduledAt: "2026-11-24T09:30:00Z", status: "scheduled", accountIds: ["otra"] }]; // 10:30 en Madrid
    const [d] = computeFreeSlots({ days: ["2026-11-24"], tz: "Europe/Madrid", now, accounts: [{ ...acc, hourScores: grid }], posts });
    expect(d.accounts[0].suggested_time).toBe("15:30");
  });
});
