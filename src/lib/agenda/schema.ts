import { z } from "zod";
import { isIsoDay, isValidTimeZone } from "@/lib/mcp/calendar";
import { AGENDA_KINDS, normalizeRepeatDays, parseTime } from "./core";

/** Validación común de un bloque (formulario de la app, propuesta aceptada y MCP). */
export const blockInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    kind: z.enum(AGENDA_KINDS),
    note: z.string().trim().max(1000).default(""),
    day: z.string().refine(isIsoDay),
    start: z.string().refine((s) => {
      const m = parseTime(s);
      return m !== null && m < 1440;
    }),
    end: z.string().refine((s) => parseTime(s) !== null),
    repeatDays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
    repeatUntil: z
      .string()
      .refine(isIsoDay)
      .nullish()
      .transform((v) => v ?? null),
    timezone: z.string().max(64).refine(isValidTimeZone).optional(),
    projectId: z.uuid().nullish().transform((v) => v ?? null),
    taskId: z.uuid().nullish().transform((v) => v ?? null),
    postId: z.uuid().nullish().transform((v) => v ?? null),
  })
  .refine((v) => parseTime(v.end)! > parseTime(v.start)!, { path: ["end"], message: "end_before_start" })
  .refine((v) => !v.repeatUntil || v.repeatUntil >= v.day, { path: ["repeatUntil"], message: "until_before_start" });

export type BlockInput = z.input<typeof blockInputSchema>;

/** Fila lista para insertar/actualizar a partir de una entrada validada. */
export function toBlockRow(v: z.output<typeof blockInputSchema>, defaultTz: string) {
  const repeat = normalizeRepeatDays(v.repeatDays);
  return {
    title: v.title,
    kind: v.kind,
    note: v.note,
    start_day: v.day,
    end_day: repeat.length ? v.repeatUntil : v.day,
    start_minute: parseTime(v.start)!,
    end_minute: parseTime(v.end)!,
    repeat_days: repeat,
    timezone: v.timezone ?? defaultTz,
    project_id: v.projectId,
    task_id: v.taskId,
    post_id: v.postId,
  };
}

export const settingsSchema = z
  .object({
    start: z.string().refine((s) => {
      const m = parseTime(s);
      return m !== null && m < 1440;
    }),
    end: z.string().refine((s) => parseTime(s) !== null),
    timezone: z.string().max(64).refine(isValidTimeZone),
  })
  .refine((v) => parseTime(v.end)! > parseTime(v.start)!, { path: ["end"] });
