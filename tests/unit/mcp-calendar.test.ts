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

  it("sugiere la franja libre más cercana a la hora preferida", () => {
    const posts = [{ scheduledAt: "2026-11-24T18:00:00Z", status: "approved", accountIds: ["other"] }];
    const [d] = computeFreeSlots({ days: ["2026-11-24"], tz: "Europe/Madrid", now, accounts: [{ ...acc, dailyLimit: 3 }], posts });
    expect(d.accounts[0]).toMatchObject({ planned: 0, remaining: 3 });
    expect(["18:00", "20:00"]).toContain(d.accounts[0].suggested_time);
  });
});
