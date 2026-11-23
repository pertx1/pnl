import { describe, expect, it } from "vitest";
import { countHashtags, validateTarget } from "@/lib/posts/rules";
import { applyDailyLimits, isoWeekday, seriesOccurrences, valuesForOccurrence, type Recurrence } from "@/lib/posts/series";
import {
  appendHashtags,
  captionStats,
  extractPlaceholders,
  fillPlaceholders,
  insertSnippet,
  nextLocalSlot,
  optionsForPlatform,
  parseHashtags,
  splitTrailingHashtags,
  templateOptionsFromTargets,
} from "@/lib/posts/templates";

const NOW = new Date("2026-11-23T10:00:00Z"); // lunes 23/11/2026, 11:00 en Madrid
const rec = (r: Partial<Recurrence>): Recurrence => ({ startDate: "2026-11-23", weekdays: [1], time: "18:00", count: 8, intervalWeeks: 1, ...r });

describe("series · recurrencia", () => {
  it("cada lunes a las 18:00 durante 8 semanas (hora de Madrid, invierno = UTC+1)", () => {
    const { occurrences, skippedPast } = seriesOccurrences(rec({}), { now: NOW });
    expect(skippedPast).toBe(0);
    expect(occurrences).toHaveLength(8);
    expect(occurrences.map((o) => o.day)).toEqual(["2026-11-23", "2026-11-30", "2026-12-07", "2026-12-14", "2026-12-21", "2026-12-28", "2027-01-04", "2027-01-11"]);
    expect(occurrences[0].at).toBe("2026-11-23T17:00:00.000Z");
    expect(occurrences.every((o) => o.time === "18:00" && !o.shifted)).toBe(true);
  });

  it("L-X-V: tres por semana, en orden", () => {
    const { occurrences } = seriesOccurrences(rec({ weekdays: [1, 3, 5], count: 6 }), { now: NOW });
    expect(occurrences.map((o) => o.day)).toEqual(["2026-11-23", "2026-11-25", "2026-11-27", "2026-11-30", "2026-12-02", "2026-12-04"]);
    expect(occurrences.map((o) => isoWeekday(o.day))).toEqual([1, 3, 5, 1, 3, 5]);
  });

  it("se salta las fechas pasadas sin contarlas", () => {
    const { occurrences, skippedPast } = seriesOccurrences(rec({ time: "09:00", count: 2 }), { now: NOW });
    expect(skippedPast).toBe(1);
    expect(occurrences.map((o) => o.day)).toEqual(["2026-11-30", "2026-12-07"]);
  });

  it("semanas alternas cuentan desde la semana de inicio", () => {
    const { occurrences } = seriesOccurrences(rec({ startDate: "2026-11-25", weekdays: [1, 3], intervalWeeks: 2, count: 3 }), { now: NOW });
    // Semana del 23/11 (miércoles 25), luego la del 7/12 (lunes 7 y miércoles 9).
    expect(occurrences.map((o) => o.day)).toEqual(["2026-11-25", "2026-12-07", "2026-12-09"]);
  });

  it("cambio de hora de primavera: 18:00 sigue siendo 18:00 local (UTC+2)", () => {
    const { occurrences } = seriesOccurrences(rec({ startDate: "2027-03-22", count: 2 }), { now: NOW });
    expect(occurrences.map((o) => o.at)).toEqual(["2027-03-22T17:00:00.000Z", "2027-03-29T16:00:00.000Z"]);
    expect(occurrences.every((o) => o.time === "18:00")).toBe(true);
  });

  it("cambio de hora de otoño: 18:00 local antes y después", () => {
    const { occurrences } = seriesOccurrences(rec({ startDate: "2027-10-25", weekdays: [7, 1], count: 3 }), { now: NOW });
    expect(occurrences.map((o) => o.day)).toEqual(["2027-10-25", "2027-10-31", "2027-11-01"]);
    expect(occurrences.map((o) => o.at)).toEqual(["2027-10-25T16:00:00.000Z", "2027-10-31T17:00:00.000Z", "2027-11-01T17:00:00.000Z"]);
  });

  it("una hora inexistente (02:30 del día del cambio de primavera) se mueve y se marca", () => {
    const { occurrences } = seriesOccurrences(rec({ startDate: "2027-03-28", weekdays: [7], time: "02:30", count: 1 }), { now: NOW });
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].shifted).toBe(true);
    expect(occurrences[0].time).not.toBe("02:30");
  });

  it("recurrencias no válidas no generan nada", () => {
    expect(seriesOccurrences(rec({ weekdays: [] }), { now: NOW }).occurrences).toEqual([]);
    expect(seriesOccurrences(rec({ count: 0 }), { now: NOW }).occurrences).toEqual([]);
    expect(seriesOccurrences(rec({ count: 53 }), { now: NOW }).occurrences).toEqual([]);
    expect(seriesOccurrences(rec({ time: "25:00" }), { now: NOW }).occurrences).toEqual([]);
    expect(seriesOccurrences(rec({ startDate: "2026-02-30" }), { now: NOW }).occurrences).toEqual([]);
  });

  it("no pasa de un año aunque se pidan más", () => {
    const { occurrences } = seriesOccurrences(rec({ intervalWeeks: 4, count: 52 }), { now: NOW });
    expect(occurrences.length).toBeLessThanOrEqual(14);
  });
});

describe("series · límite diario por cuenta", () => {
  const acc = { id: "a", dailyLimit: 1 };
  it("bloquea la fecha si la cuenta ya tiene su máximo ese día", () => {
    const { occurrences } = seriesOccurrences(rec({ count: 2 }), { now: NOW });
    const planned = applyDailyLimits(occurrences, [acc, { id: "b", dailyLimit: 3 }], [{ scheduledAt: "2026-11-23T09:00:00Z", status: "scheduled", accountIds: ["a"] }]);
    expect(planned[0].blockedAccountIds).toEqual(["a"]);
    expect(planned[1].blockedAccountIds).toEqual([]);
  });

  it("los borradores y cancelados no ocupan hueco; los pendientes sí", () => {
    const { occurrences } = seriesOccurrences(rec({ count: 1 }), { now: NOW });
    expect(applyDailyLimits(occurrences, [acc], [{ scheduledAt: "2026-11-23T09:00:00Z", status: "draft", accountIds: ["a"] }])[0].blockedAccountIds).toEqual([]);
    expect(applyDailyLimits(occurrences, [acc], [{ scheduledAt: "2026-11-23T09:00:00Z", status: "cancelled", accountIds: ["a"] }])[0].blockedAccountIds).toEqual([]);
    expect(applyDailyLimits(occurrences, [acc], [{ scheduledAt: "2026-11-23T09:00:00Z", status: "pending_approval", accountIds: ["a"] }])[0].blockedAccountIds).toEqual(["a"]);
  });

  it("cuenta las fechas anteriores de la propia serie (dos al día con límite 1)", () => {
    // 00:30 de Madrid = 23:30 UTC del día anterior → el día UTC coincide con la de las 18:00 del día anterior.
    const occ = [
      { day: "2026-11-23", time: "18:00", at: "2026-11-23T17:00:00.000Z", shifted: false },
      { day: "2026-11-24", time: "00:30", at: "2026-11-23T23:30:00.000Z", shifted: false },
    ];
    const planned = applyDailyLimits(occ, [acc], []);
    expect(planned[0].blockedAccountIds).toEqual([]);
    expect(planned[1].blockedAccountIds).toEqual(["a"]); // mismo día UTC (lo que comprueba la aprobación)
  });

  it("también por día local: una de madrugada en Madrid cae en el día UTC anterior", () => {
    const occ = [{ day: "2026-11-24", time: "00:30", at: "2026-11-23T23:30:00.000Z", shifted: false }];
    const planned = applyDailyLimits(occ, [acc], [{ scheduledAt: "2026-11-24T18:00:00Z", status: "scheduled", accountIds: ["a"] }]);
    expect(planned[0].blockedAccountIds).toEqual(["a"]);
  });

  it("los valores de los huecos se reparten por orden", () => {
    const lists = { tema: ["Latte", "Espresso"], ciudad: ["Bilbao"] };
    expect(valuesForOccurrence(lists, 0)).toEqual({ tema: "Latte", ciudad: "Bilbao" });
    expect(valuesForOccurrence(lists, 1)).toEqual({ tema: "Espresso" });
    expect(valuesForOccurrence(lists, 5)).toEqual({});
  });
});

describe("plantillas · huecos y hashtags", () => {
  it("encuentra y rellena huecos; deja los que no tienen valor", () => {
    expect(extractPlaceholders("Hoy: {tema} en {ciudad}. Más {tema}", "{título}")).toEqual(["tema", "ciudad", "título"]);
    expect(fillPlaceholders("Hoy: {tema} en {ciudad}", { tema: " Latte " })).toBe("Hoy: Latte en {ciudad}");
    expect(extractPlaceholders("JSON {a b} o {} no cuentan")).toEqual([]);
  });

  it("normaliza hashtags y quita duplicados", () => {
    expect(parseHashtags("café, #Café #barista ##latte nope! #")).toEqual(["#café", "#barista", "#latte"]);
  });

  it("añade hashtags al final sin repetir", () => {
    expect(appendHashtags("Hola #cafe", ["#Cafe", "#latte"])).toBe("Hola #cafe\n\n#latte");
    expect(appendHashtags("", ["#a"])).toBe("#a");
    expect(appendHashtags("x", [])).toBe("x");
  });

  it("separa el bloque final de hashtags", () => {
    expect(splitTrailingHashtags("Texto\n\n#a #b\n")).toEqual({ body: "Texto", hashtags: ["#a", "#b"] });
    expect(splitTrailingHashtags("Solo texto #a dentro")).toEqual({ body: "Solo texto #a dentro", hashtags: [] });
    expect(splitTrailingHashtags("#a #b")).toEqual({ body: "#a #b", hashtags: [] });
  });

  it("inserta textos guardados en el cursor", () => {
    expect(insertSnippet("Hola mundo", "Compra ya", 4, 4, "text")).toEqual({ text: "Hola Compra ya mundo", cursor: 14 });
    expect(insertSnippet("Hola", "#a #b", 4, 4, "hashtags")).toEqual({ text: "Hola\n\n#a #b", cursor: 11 });
    expect(insertSnippet("", "CTA", 0, 0, "text")).toEqual({ text: "CTA", cursor: 3 });
    expect(insertSnippet("A XX B", "Y", 2, 4, "text").text).toBe("A Y B");
  });

  it("cuenta hashtags sin confundir anclas de URL", () => {
    expect(countHashtags("#a #b texto#c https://web.com/#ancla &#39;")).toBe(2);
  });

  it("contadores por red y límite de hashtags de Instagram", () => {
    const many = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    const [ig, tt] = captionStats(many, ["instagram", "tiktok"]);
    expect(ig).toMatchObject({ hashtags: 31, maxHashtags: 30, over: true });
    expect(tt).toMatchObject({ hashtags: 31, maxHashtags: null, over: false });
    expect(validateTarget("instagram", many, ["image"], {})).toEqual(["too_many_hashtags"]);
  });
});

describe("plantillas · opciones por red", () => {
  it("nunca guarda opciones de TikTok (sus normas: sin valores por defecto)", () => {
    const o = templateOptionsFromTargets([{ platform: "tiktok", options: { privacy_level: "PUBLIC_TO_EVERYONE", disable_comment: false } }]);
    expect(o).toEqual({});
  });

  it("YouTube: sin miniatura; lista solo con un único canal", () => {
    const yt = { yt_title: "{tema} en 1 min", yt_privacy: "public" as const, yt_thumbnail_asset_id: "x", yt_playlist_id: "PLabcdefghij" };
    expect(templateOptionsFromTargets([{ platform: "youtube", options: yt }])).toEqual({ youtube: { yt_title: "{tema} en 1 min", yt_privacy: "public", yt_playlist_id: "PLabcdefghij" } });
    expect(templateOptionsFromTargets([{ platform: "youtube", options: yt }, { platform: "youtube", options: {} }]).youtube?.yt_playlist_id).toBeUndefined();
    expect(optionsForPlatform({ youtube: { yt_title: "{tema} en 1 min" } }, "youtube", { tema: "Latte" })).toEqual({ yt_title: "Latte en 1 min" });
    expect(optionsForPlatform({ youtube: { yt_title: "x" } }, "tiktok")).toEqual({});
  });

  it("próxima hora preferida: hoy si aún llega, si no mañana", () => {
    const now = new Date(2026, 10, 23, 10, 0);
    expect(nextLocalSlot(now, "18:00")).toBe("2026-11-23T18:00");
    expect(nextLocalSlot(now, "09:00")).toBe("2026-11-24T09:00");
  });
});
