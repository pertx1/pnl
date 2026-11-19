"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAgentsConfigured } from "@/lib/agents";
import { isFalConfigured } from "@/lib/ai/providers/fal";
import { advanceJob, advanceSegment, CLIPPER_LICENSE, FAL, refundGeneration, submitTranscription } from "@/lib/clipper/pipeline";
import { analysisCredits, MAX_CLIP_S, MAX_SOURCE_S, MAX_UPLOAD_BYTES, MIN_CLIP_S, renderCredits, safeTitle, subtitleStyle } from "@/lib/clipper/segments";
import { toErrorKey } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Result<T = undefined> = { ok: true; data?: T } | { ok?: false; error: string };
const revalidate = (projectId: string) => revalidatePath(`/app/p/${projectId}/clipper`);

function clipperConfigured() {
  return isFalConfigured() && isAgentsConfigured() && Boolean(createAdminClient());
}

const createSchema = z.object({
  projectId: z.uuid(),
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.mp4$/),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  durationS: z.number().positive().max(MAX_SOURCE_S),
  filename: z.string().max(300),
  rightsConfirmed: z.literal(true), // casilla obligatoria: contenido propio o con derechos
  idempotencyKey: z.uuid(),
});

/**
 * Crea un trabajo del Clipper a partir de un MP4 ya subido por el navegador a `project-media/{ws}/{proyecto}/…`:
 * registra el vídeo en la biblioteca, cobra el análisis (atómico) y envía la transcripción a la cola de fal.ai.
 */
export async function createClipJob(input: z.input<typeof createSchema>): Promise<Result<{ jobId: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const admin = createAdminClient();
  if (!clipperConfigured() || !admin) return { error: "not_configured" };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", d.projectId).maybeSingle();
  if (!auth.user || !project || !d.path.startsWith(`${project.workspace_id}/${d.projectId}/`)) return { error: "forbidden" };
  const { data: canEdit } = await supabase.rpc("has_workspace_role", { p_workspace_id: project.workspace_id, p_min_role: "editor" });
  if (!canEdit) return { error: "forbidden" };

  // 1) El vídeo original entra en la biblioteca como subida propia (RLS: editor).
  const { data: asset, error: assetErr } = await supabase
    .from("assets")
    .insert({ workspace_id: project.workspace_id, project_id: d.projectId, storage_path: d.path, mime_type: "video/mp4", size_bytes: d.size, source: "upload", created_by: auth.user.id })
    .select("id")
    .single();
  if (assetErr || !asset) return { error: toErrorKey(assetErr) };

  // 2) Cobro atómico del análisis (transcripción + mejores momentos).
  const credits = analysisCredits(d.durationS);
  const title = safeTitle(d.filename);
  const { data: generationId, error } = await supabase.rpc("start_ai_generation", {
    p_project_id: d.projectId,
    p_kind: "video",
    p_provider: "fal+anthropic",
    p_model: `${FAL.whisper} + claude-opus-5-5`,
    p_prompt: `clipper.analysis: ${title}`,
    p_params: { agent: "clipper.analysis", source_asset_id: asset.id, declared_duration_s: Math.round(d.durationS) },
    p_credits: credits,
    p_license: CLIPPER_LICENSE,
    p_idempotency_key: d.idempotencyKey,
  });
  if (error) {
    await supabase.from("assets").delete().eq("id", asset.id); // el navegador borra también el archivo
    return { error: error.message.includes("insufficient_credits") ? "insufficient_credits" : toErrorKey(error) };
  }

  const { data: job, error: jobErr } = await admin
    .from("clip_jobs")
    .insert({
      workspace_id: project.workspace_id,
      project_id: d.projectId,
      source_asset_id: asset.id,
      title,
      declared_duration_s: Math.round(d.durationS * 10) / 10,
      generation_id: generationId,
      rights_confirmed_at: new Date().toISOString(),
      created_by: auth.user.id,
      provider_state: { locale: await getLocale() },
    })
    .select("id")
    .single();
  if (jobErr || !job) {
    await refundGeneration(admin, generationId, "db_error");
    await supabase.from("assets").delete().eq("id", asset.id);
    return { error: "generic" };
  }

  // 3) Transcripción en la cola de fal.ai.
  try {
    await submitTranscription(job.id);
  } catch (e) {
    console.error("[clipper] no se pudo enviar la transcripción", (e as Error).message?.slice(0, 60));
    await admin.from("clip_jobs").update({ status: "failed", error_code: "provider_error" }).eq("id", job.id);
    await refundGeneration(admin, generationId, "provider_error");
    return { error: "provider_error" };
  }
  revalidate(d.projectId);
  return { ok: true, data: { jobId: job.id } };
}

export type JobProgress = { status: string; segments: { id: string; status: string; step: string | null }[] };

/** Consulta (y avanza) un trabajo y sus renders en curso. El navegador la llama cada pocos segundos. */
export async function checkClipJob(jobId: string): Promise<JobProgress | null> {
  if (!z.uuid().safeParse(jobId).success) return null;
  const supabase = await createClient();
  const { data: job } = await supabase.from("clip_jobs").select("id, status").eq("id", jobId).maybeSingle(); // RLS
  if (!job) return null;
  let status: string = job.status;
  if (status === "transcribing" || status === "analyzing") status = await advanceJob(jobId).catch(() => status);
  const { data: rendering } = await supabase.from("clip_segments").select("id").eq("job_id", jobId).eq("status", "rendering");
  for (const s of rendering ?? []) await advanceSegment(s.id).catch(() => undefined);
  const { data: segs } = await supabase.from("clip_segments").select("id, status, render_step").eq("job_id", jobId);
  return { status, segments: (segs ?? []).map((s) => ({ id: s.id, status: s.status, step: s.render_step })) };
}

const segSchema = z.object({ start: z.number().min(0), end: z.number().positive(), title: z.string().trim().min(1).max(200) });

/** Ajuste manual de un momento propuesto (tiempos y título). */
export async function updateSegment(segmentId: string, input: z.input<typeof segSchema>): Promise<Result> {
  const parsed = segSchema.safeParse(input);
  if (!z.uuid().safeParse(segmentId).success || !parsed.success) return { error: "invalid_input" };
  const { start, end, title } = parsed.data;
  if (end - start < MIN_CLIP_S || end - start > MAX_CLIP_S) return { error: "bad_range" };
  const supabase = await createClient();
  const { data: seg } = await supabase.from("clip_segments").select("id, project_id, clip_jobs!inner(duration_s)").eq("id", segmentId).maybeSingle();
  if (!seg) return { error: "forbidden" };
  const duration = Number(seg.clip_jobs.duration_s ?? 0);
  if (duration && end > duration + 0.5) return { error: "bad_range" };
  const { data, error } = await supabase
    .from("clip_segments")
    .update({ start_s: Math.round(start * 10) / 10, end_s: Math.round(end * 10) / 10, title })
    .eq("id", segmentId)
    .select("id");
  if (error || !data?.length) return { error: "forbidden" };
  revalidate(seg.project_id);
  return { ok: true };
}

const renderSchema = z.object({ jobId: z.uuid(), segmentIds: z.array(z.uuid()).min(1).max(8), subtitles: z.boolean() });

/** Genera los shorts elegidos. Cobra cada short por separado (atómico) y lo devuelve si su render falla. */
export async function renderSegments(input: z.input<typeof renderSchema>): Promise<Result<{ started: number }>> {
  const parsed = renderSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const admin = createAdminClient();
  if (!isFalConfigured() || !admin) return { error: "not_configured" };
  const supabase = await createClient();
  const { data: job } = await supabase.from("clip_jobs").select("id, project_id, workspace_id, status").eq("id", d.jobId).maybeSingle();
  if (!job || job.status !== "ready") return { error: "forbidden" };
  const { data: segs } = await supabase.from("clip_segments").select("id, start_s, end_s, status").eq("job_id", job.id).in("id", d.segmentIds);
  const todo = (segs ?? []).filter((s) => s.status === "proposed" || s.status === "failed");
  if (!todo.length) return { error: "invalid_input" };

  // Estilo de subtítulos a partir del brand kit (colores → nombres admitidos por fal; fuente de Google Fonts).
  const { data: kit } = await supabase.from("brand_kits").select("colors, fonts").eq("project_id", job.project_id).maybeSingle();
  const colors = Array.isArray(kit?.colors) ? (kit!.colors as { hex?: string }[]).map((c) => c.hex).filter((x): x is string => Boolean(x)) : [];
  const fonts = Array.isArray(kit?.fonts) ? (kit!.fonts as { family?: string }[]).map((f) => f.family).filter((x): x is string => Boolean(x)) : [];
  const fontName = (fonts[0] ?? "Montserrat").replace(/[^A-Za-z0-9 ]/g, "").slice(0, 60) || "Montserrat";
  const style = { ...subtitleStyle(colors), font_name: fontName };

  let started = 0;
  for (const s of todo) {
    const clipS = Number(s.end_s) - Number(s.start_s);
    const credits = renderCredits(clipS, d.subtitles);
    const { data: generationId, error } = await supabase.rpc("start_ai_generation", {
      p_project_id: job.project_id,
      p_kind: "video",
      p_provider: "fal",
      p_model: [FAL.trim, FAL.scale, d.subtitles ? FAL.subtitle : null].filter(Boolean).join(" → "),
      p_prompt: `clipper.render ${s.id}`,
      p_params: { agent: "clipper.render", segment_id: s.id, seconds: Math.round(clipS), subtitles: d.subtitles },
      p_credits: credits,
      p_license: CLIPPER_LICENSE,
      p_idempotency_key: crypto.randomUUID(),
    });
    if (error) {
      if (started === 0) return { error: error.message.includes("insufficient_credits") ? "insufficient_credits" : toErrorKey(error) };
      break; // sin saldo para más: los ya iniciados siguen
    }
    await admin
      .from("clip_segments")
      .update({ status: "rendering", render_step: "trim", subtitles: d.subtitles, generation_id: generationId, asset_id: null, error_code: null, provider_state: { style } as Json })
      .eq("id", s.id);
    await advanceSegment(s.id).catch(() => undefined); // envía el primer paso
    started++;
  }
  revalidate(job.project_id);
  return { ok: true, data: { started } };
}

/** Borra un trabajo (transcripción y momentos). El vídeo original y los shorts siguen en la biblioteca. */
export async function deleteClipJob(jobId: string): Promise<Result> {
  if (!z.uuid().safeParse(jobId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: job } = await supabase.from("clip_jobs").select("id, project_id, status").eq("id", jobId).maybeSingle();
  if (!job) return { error: "forbidden" };
  const { data: busy } = await supabase.from("clip_segments").select("id").eq("job_id", jobId).eq("status", "rendering").limit(1);
  if (busy?.length || job.status === "transcribing" || job.status === "analyzing") return { error: "busy" };
  const { data, error } = await supabase.from("clip_jobs").delete().eq("id", jobId).select("id");
  if (error || !data?.length) return { error: "forbidden" };
  revalidate(job.project_id);
  return { ok: true };
}
