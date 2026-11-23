"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_DAY, normalizeRepeatDays, parseTime } from "@/lib/agenda/core";
import { blockInputSchema, settingsSchema, toBlockRow, type BlockInput } from "@/lib/agenda/schema";
import { isMissingTable } from "@/lib/agenda/server";
import { isIsoDay } from "@/lib/mcp/calendar";
import { createClient } from "@/lib/supabase/server";

/**
 * Acciones de «Mi agenda». Todo con la sesión del usuario: RLS solo deja tocar sus propios bloques
 * (y vincular proyectos, tareas o publicaciones que puede ver). Nada se guarda sin que el usuario lo confirme.
 */
export type AgendaActionResult = { ok: true; count?: number } | { ok: false; error: "invalid_input" | "unavailable" | "not_found" | "generic" };

async function session() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, userId: data.user?.id ?? null };
}

async function userTimezone(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from("agenda_settings").select("timezone").eq("user_id", userId).maybeSingle();
  return data?.timezone ?? DEFAULT_DAY.timezone;
}

function fail(error: { code?: string; message?: string } | null): AgendaActionResult {
  if (isMissingTable(error)) return { ok: false, error: "unavailable" };
  if (error?.code === "42501") return { ok: false, error: "not_found" };
  return { ok: false, error: "generic" };
}

function done(count?: number): AgendaActionResult {
  revalidatePath("/app/agenda");
  revalidatePath("/app");
  return { ok: true, count };
}

export async function createAgendaBlock(input: BlockInput): Promise<AgendaActionResult> {
  const parsed = blockInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { supabase, userId } = await session();
  if (!userId) return { ok: false, error: "not_found" };
  const tz = await userTimezone(supabase, userId);
  const { error } = await supabase.from("agenda_blocks").insert({ ...toBlockRow(parsed.data, tz), user_id: userId, source: "manual" });
  return error ? fail(error) : done();
}

export async function updateAgendaBlock(id: string, input: BlockInput): Promise<AgendaActionResult> {
  const parsed = blockInputSchema.safeParse(input);
  if (!z.uuid().safeParse(id).success || !parsed.success) return { ok: false, error: "invalid_input" };
  const { supabase, userId } = await session();
  if (!userId) return { ok: false, error: "not_found" };
  const tz = await userTimezone(supabase, userId);
  const { data, error } = await supabase.from("agenda_blocks").update(toBlockRow(parsed.data, tz)).eq("id", id).eq("user_id", userId).select("id");
  if (error) return fail(error);
  return data?.length ? done() : { ok: false, error: "not_found" };
}

/** Mueve un bloque (arrastrar): nuevo día y hora de inicio, misma duración. En una serie, mueve toda la serie de hora. */
export async function moveAgendaBlock(id: string, day: string, startMinute: number): Promise<AgendaActionResult> {
  if (!z.uuid().safeParse(id).success || !isIsoDay(day) || !Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1435) {
    return { ok: false, error: "invalid_input" };
  }
  const { supabase, userId } = await session();
  if (!userId) return { ok: false, error: "not_found" };
  const { data: b, error } = await supabase.from("agenda_blocks").select("start_minute, end_minute, repeat_days").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) return fail(error);
  if (!b) return { ok: false, error: "not_found" };
  const len = b.end_minute - b.start_minute;
  const end = Math.min(1440, startMinute + len);
  const patch = b.repeat_days.length ? { start_minute: startMinute, end_minute: end } : { start_minute: startMinute, end_minute: end, start_day: day, end_day: day };
  const { error: upErr } = await supabase.from("agenda_blocks").update(patch).eq("id", id).eq("user_id", userId);
  return upErr ? fail(upErr) : done();
}

/** Borra un bloque. En una serie, `scope: "one"` solo quita ese día (lo añade a los días saltados). */
export async function deleteAgendaBlock(id: string, scope: "one" | "all", day?: string): Promise<AgendaActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "invalid_input" };
  const { supabase, userId } = await session();
  if (!userId) return { ok: false, error: "not_found" };
  if (scope === "one") {
    if (!day || !isIsoDay(day)) return { ok: false, error: "invalid_input" };
    const { data: b, error } = await supabase.from("agenda_blocks").select("repeat_days, skipped_days").eq("id", id).eq("user_id", userId).maybeSingle();
    if (error) return fail(error);
    if (!b) return { ok: false, error: "not_found" };
    if (b.repeat_days.length) {
      const skipped = [...new Set([...b.skipped_days, day])].sort().slice(-400);
      const { error: upErr } = await supabase.from("agenda_blocks").update({ skipped_days: skipped }).eq("id", id).eq("user_id", userId);
      return upErr ? fail(upErr) : done();
    }
  }
  const { error } = await supabase.from("agenda_blocks").delete().eq("id", id).eq("user_id", userId);
  return error ? fail(error) : done();
}

export async function saveAgendaSettings(input: { start: string; end: string; timezone: string }): Promise<AgendaActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { supabase, userId } = await session();
  if (!userId) return { ok: false, error: "not_found" };
  const { error } = await supabase.from("agenda_settings").upsert({
    user_id: userId,
    day_start_minute: parseTime(parsed.data.start)!,
    day_end_minute: parseTime(parsed.data.end)!,
    timezone: parsed.data.timezone,
  });
  return error ? fail(error) : done();
}

const acceptedSchema = z
  .array(
    z.object({
      title: z.string().trim().min(1).max(120),
      day: z.string().refine(isIsoDay),
      startMinute: z.number().int().min(0).max(1439),
      endMinute: z.number().int().min(1).max(1440),
      projectId: z.uuid().nullable(),
      taskId: z.uuid().nullable(),
      postId: z.uuid().nullable(),
    }),
  )
  .min(1)
  .max(60);

/** Guarda la propuesta de «Planificar» que el usuario ha revisado y aceptado (bloques de creación puntuales). */
export async function acceptAgendaPlan(blocks: z.input<typeof acceptedSchema>): Promise<AgendaActionResult> {
  const parsed = acceptedSchema.safeParse(blocks);
  if (!parsed.success || parsed.data.some((b) => b.endMinute <= b.startMinute)) return { ok: false, error: "invalid_input" };
  const { supabase, userId } = await session();
  if (!userId) return { ok: false, error: "not_found" };
  const tz = await userTimezone(supabase, userId);
  const rows = parsed.data.map((b) => ({
    user_id: userId,
    title: b.title,
    kind: "creation" as const,
    start_day: b.day,
    end_day: b.day,
    start_minute: b.startMinute,
    end_minute: b.endMinute,
    repeat_days: normalizeRepeatDays([]),
    timezone: tz,
    project_id: b.projectId,
    task_id: b.taskId,
    post_id: b.postId,
    source: "plan" as const,
  }));
  const { error } = await supabase.from("agenda_blocks").insert(rows);
  return error ? fail(error) : done(rows.length);
}
