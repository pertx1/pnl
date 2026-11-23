import { describe, expect, it } from "vitest";
import {
  estimateMinutes,
  expandBlocks,
  freeSlotsForDay,
  freeSlotsForRange,
  isoWeekday,
  occursOn,
  parseTime,
  planTime,
  proposalToMinutes,
  splitMinutes,
  viewRange,
  weekStart,
  type BlockLike,
  type PlanItem,
} from "@/lib/agenda/core";
import { blockInputSchema, toBlockRow } from "@/lib/agenda/schema";

const TZ = "Europe/Madrid";
const settings = { startMinute: 8 * 60, endMinute: 23 * 60, timezone: TZ };

const block = (over: Partial<BlockLike> = {}): BlockLike => ({
  id: "b1",
  title: "Trabajo",
  kind: "work",
  start_day: "2026-11-23",
  end_day: null,
  start_minute: 9 * 60,
  end_minute: 17 * 60,
  repeat_days: [1, 2, 3, 4, 5],
  skipped_days: [],
  timezone: TZ,
  ...over,
});

describe("agenda · fechas", () => {
  it("días de la semana ISO y lunes de la semana", () => {
    expect(isoWeekday("2026-11-23")).toBe(1); // lunes
    expect(isoWeekday("2026-11-29")).toBe(7); // domingo
    expect(weekStart("2026-11-29")).toBe("2026-11-23");
    expect(viewRange("week", "2026-11-25")).toEqual({ from: "2026-11-23", to: "2026-11-29" });
    expect(viewRange("day", "2026-11-25")).toEqual({ from: "2026-11-25", to: "2026-11-25" });
  });
  it("lee horas HH:MM (incluido 24:00)", () => {
    expect(parseTime("09:30")).toBe(570);
    expect(parseTime("24:00")).toBe(1440);
    expect(parseTime("24:30")).toBeNull();
    expect(parseTime("9:75")).toBeNull();
    expect(splitMinutes(200)).toEqual({ h: 3, m: 20 });
  });
});

describe("agenda · recurrencias", () => {
  it("«Trabajo L-V 9:00-17:00» ocurre de lunes a viernes y no el fin de semana", () => {
    const occ = expandBlocks([block()], "2026-11-23", "2026-11-29");
    expect(occ.map((o) => o.day)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"]);
    expect(occ[0]).toMatchObject({ start: "2026-11-23T08:00:00.000Z", end: "2026-11-23T16:00:00.000Z", recurring: true });
  });

  it("respeta la fecha de fin y los días saltados", () => {
    const b = block({ end_day: "2026-11-25", skipped_days: ["2026-11-24"] });
    expect(expandBlocks([b], "2026-11-23", "2026-11-29").map((o) => o.day)).toEqual(["2026-11-23", "2026-11-25"]);
    expect(occursOn(b, "2026-11-22")).toBe(false);
  });

  it("un bloque puntual solo ocurre su día", () => {
    const b = block({ repeat_days: [], end_day: "2026-11-25", start_day: "2026-11-25" });
    expect(expandBlocks([b], "2026-11-23", "2026-11-29").map((o) => o.day)).toEqual(["2026-11-25"]);
  });

  it("mantiene la hora local tras el cambio de hora (25 oct 2026)", () => {
    const occ = expandBlocks([block({ start_day: "2026-10-19" })], "2026-10-23", "2026-10-26");
    // Viernes 23 (verano, UTC+2) y lunes 26 (invierno, UTC+1): siempre las 9:00 en Madrid.
    expect(occ.map((o) => o.start)).toEqual(["2026-10-23T07:00:00.000Z", "2026-10-26T08:00:00.000Z"]);
  });
});

describe("agenda · huecos libres", () => {
  it("resta los bloques de la jornada 08:00–23:00", () => {
    const occ = expandBlocks([block({ start_day: "2026-11-24", repeat_days: [], end_day: "2026-11-24" })], "2026-11-24", "2026-11-24");
    const { slots, totalMinutes } = freeSlotsForDay({
      day: "2026-11-24",
      settings,
      busy: occ.map((o) => ({ start: Date.parse(o.start), end: Date.parse(o.end) })),
    });
    expect(slots.map((s) => [s.startTime, s.endTime])).toEqual([
      ["08:00", "09:00"],
      ["17:00", "23:00"],
    ]);
    expect(totalMinutes).toBe(7 * 60);
  });

  it("une bloques solapados y descarta huecos de menos de 15 min", () => {
    const at = (h: number, m = 0) => Date.parse(`2026-11-24T${String(h - 1).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`); // Madrid = UTC+1
    const { slots } = freeSlotsForDay({
      day: "2026-11-24",
      settings,
      busy: [
        { start: at(10), end: at(12) },
        { start: at(11), end: at(13) },
        { start: at(13, 10), end: at(14) }, // deja un hueco de 10 min entre 13:00 y 13:10
      ],
    });
    expect(slots.map((s) => [s.startTime, s.endTime])).toEqual([
      ["08:00", "10:00"],
      ["14:00", "23:00"],
    ]);
  });

  it("hoy solo cuenta desde ahora y los días pasados no tienen huecos", () => {
    const now = Date.parse("2026-11-24T15:02:00Z"); // 16:02 en Madrid
    const today = freeSlotsForDay({ day: "2026-11-24", settings, busy: [], nowMs: now });
    expect(today.slots[0].startTime).toBe("16:05");
    expect(freeSlotsForDay({ day: "2026-11-23", settings, busy: [], nowMs: now }).totalMinutes).toBe(0);
  });

  it("el día del cambio de hora dura lo que dura de verdad (29 mar 2026: 23 h)", () => {
    const whole = { startMinute: 0, endMinute: 1440, timezone: TZ };
    expect(freeSlotsForDay({ day: "2026-03-29", settings: whole, busy: [] }).totalMinutes).toBe(23 * 60);
    expect(freeSlotsForDay({ day: "2026-10-25", settings: whole, busy: [] }).totalMinutes).toBe(25 * 60);
    expect(freeSlotsForDay({ day: "2026-11-24", settings: whole, busy: [] }).slots[0].endTime).toBe("24:00");
  });

  it("calcula varios días a partir de las ocurrencias", () => {
    const occ = expandBlocks([block()], "2026-11-28", "2026-11-30");
    const days = freeSlotsForRange({ days: ["2026-11-28", "2026-11-29", "2026-11-30"], settings, occurrences: occ });
    expect(days.map((d) => d.totalMinutes)).toEqual([15 * 60, 15 * 60, 7 * 60]);
  });
});

describe("agenda · reparto del tiempo", () => {
  const slots = freeSlotsForRange({
    days: ["2026-11-24", "2026-11-25"],
    settings,
    occurrences: expandBlocks([block()], "2026-11-24", "2026-11-25"),
  }).flatMap((d) => d.slots);

  it("estima duraciones por el título", () => {
    expect(estimateMinutes("Grabar vídeo del sérum", "task")).toBe(60);
    expect(estimateMinutes("Editar el reel", "task")).toBe(45);
    expect(estimateMinutes("Escribir guion", "task")).toBe(20);
    expect(estimateMinutes("Revisar métricas", "task")).toBe(45);
    expect(estimateMinutes("Lanzamiento", "post")).toBe(30);
  });

  it("prioriza lo que vence antes y no solapa los bloques (con 10 min de descanso)", () => {
    const items: PlanItem[] = [
      { id: "task:late", type: "task", title: "Sin fecha", projectId: null, due: null, minutes: 45 },
      { id: "task:a", type: "task", title: "Grabar", projectId: "p1", due: "2026-11-24", minutes: 60 },
      { id: "post:b", type: "post", title: "Preparar post", projectId: "p2", due: "2026-11-24", minutes: 30 },
    ];
    const { proposals, unplaced } = planTime({ items, slots, timezone: TZ });
    expect(unplaced).toEqual([]);
    expect(proposals.map((p) => [p.itemId, p.day, p.startTime, p.endTime])).toEqual([
      ["task:a", "2026-11-24", "08:00", "09:00"],
      ["post:b", "2026-11-24", "17:00", "17:30"],
      ["task:late", "2026-11-24", "17:40", "18:25"],
    ]);
  });

  it("si no cabe antes de su fecha la pone después y lo marca; lo que no cabe en ningún sitio queda fuera", () => {
    const items: PlanItem[] = [
      { id: "task:big", type: "task", title: "Rodaje", projectId: null, due: "2026-11-24", minutes: 7 * 60 },
      { id: "task:huge", type: "task", title: "Imposible", projectId: null, due: null, minutes: 20 * 60 },
    ];
    const withSaturday = freeSlotsForRange({
      days: ["2026-11-24", "2026-11-28"],
      settings,
      occurrences: expandBlocks([block()], "2026-11-24", "2026-11-28"),
    }).flatMap((d) => d.slots);
    const { proposals, unplaced } = planTime({ items, slots: withSaturday, timezone: TZ });
    // El martes 24 hay 60 + 360 min libres en dos huecos: 7 h no caben → va al sábado 28, después de su fecha.
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ itemId: "task:big", day: "2026-11-28", late: true, startTime: "08:00" });
    expect(unplaced).toEqual(["task:huge"]);
  });

  it("convierte una propuesta en minutos locales para guardarla", () => {
    const [p] = planTime({ items: [{ id: "x", type: "task", title: "t", projectId: null, due: null, minutes: 45 }], slots, timezone: TZ }).proposals;
    expect(proposalToMinutes(p, TZ)).toEqual({ startMinute: 480, endMinute: 525 });
  });
});

describe("agenda · validación de bloques", () => {
  it("acepta un bloque recurrente y lo convierte en fila", () => {
    const v = blockInputSchema.parse({ title: " Trabajo ", kind: "work", day: "2026-11-23", start: "09:00", end: "17:00", repeatDays: [5, 1, 2, 3, 4, 4] });
    expect(toBlockRow(v, TZ)).toMatchObject({ title: "Trabajo", start_minute: 540, end_minute: 1020, repeat_days: [1, 2, 3, 4, 5], end_day: null, timezone: TZ });
  });
  it("un bloque puntual termina el mismo día y rechaza horas al revés", () => {
    const v = blockInputSchema.parse({ title: "Gym", kind: "sport", day: "2026-11-23", start: "19:00", end: "20:00" });
    expect(toBlockRow(v, TZ)).toMatchObject({ end_day: "2026-11-23", repeat_days: [] });
    expect(blockInputSchema.safeParse({ title: "x", kind: "other", day: "2026-11-23", start: "10:00", end: "09:00" }).success).toBe(false);
    expect(blockInputSchema.safeParse({ title: "x", kind: "nope", day: "2026-11-23", start: "10:00", end: "11:00" }).success).toBe(false);
  });
});
