"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AgentRefusalError, isAgentsConfigured } from "@/lib/agents";
import { AGENT_MODEL } from "@/lib/agents/client";
import { getBrandContext } from "@/lib/ai/brand-context";
import { isFalConfigured } from "@/lib/ai/providers/fal";
import { CLIP_COPY_VERSION, writeClipCopy } from "@/lib/clipper/captions";
import { advanceJob, advanceSegment, CLIPPER_LICENSE, FAL, refundGeneration, submitTranscription } from "@/lib/clipper/pipeline";
import { clipCopyCredits, type ClipCopy } from "@/lib/clipper/schedule";
import { planForAccounts } from "@/lib/clipper/schedule-server";
import { analysisCredits, MAX_CLIP_S, MAX_SOURCE_S, MAX_UPLOAD_BYTES, MIN_CLIP_S, renderCredits, safeTitle, type TranscriptChunk } from "@/lib/clipper/segments";
import { renderOptionsSchema, resolveRenderOptions, type ResolvedRender } from "@/lib/clipper/styles";
import { validateTarget, type PlatformOptions } from "@/lib/posts/rules";
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

const renderSchema = z.object({ jobId: z.uuid(), segmentIds: z.array(z.uuid()).min(1).max(8), options: renderOptionsSchema });

type Supa = Awaited<ReturnType<typeof createClient>>;
type AdminDb = NonNullable<ReturnType<typeof createAdminClient>>;

/** Fuente del brand kit (la usan las plantillas que no imponen una). */
async function brandFont(supabase: Supa, projectId: string) {
  const { data: kit } = await supabase.from("brand_kits").select("fonts").eq("project_id", projectId).maybeSingle();
  const fonts = Array.isArray(kit?.fonts) ? (kit!.fonts as { family?: string }[]).map((f) => f.family).filter((x): x is string => Boolean(x)) : [];
  return fonts[0] ?? null;
}

async function canEditProject(supabase: Supa, workspaceId: string) {
  const { data } = await supabase.rpc("has_workspace_role", { p_workspace_id: workspaceId, p_min_role: "editor" });
  return Boolean(data);
}

/**
 * Lanza el render de un segmento: lo RECLAMA de forma atómica (solo si sigue en el estado esperado, así dos clics
 * simultáneos no cobran dos veces), cobra (atómico) y envía el primer paso. Si el cobro falla, deshace el reclamo.
 */
async function startRender(
  supabase: Supa,
  admin: AdminDb,
  seg: { id: string; status: string; start_s: number; end_s: number; title: string },
  projectId: string,
  resolved: ResolvedRender,
  changes: { start_s?: number; end_s?: number; title?: string } = {},
): Promise<{ ok: true } | { error: string }> {
  const startS = changes.start_s ?? Number(seg.start_s);
  const endS = changes.end_s ?? Number(seg.end_s);
  const { data: claimed } = await admin
    .from("clip_segments")
    .update({ ...changes, status: "rendering", render_step: "trim", subtitles: resolved.subtitles, render_options: resolved as unknown as Json, generation_id: null, error_code: null, provider_state: {} })
    .eq("id", seg.id)
    .eq("status", seg.status as "proposed" | "failed" | "done")
    .select("id");
  if (!claimed?.length) return { error: "busy" };

  const clipS = endS - startS;
  const credits = renderCredits(clipS, resolved.subtitles);
  const { data: generationId, error } = await supabase.rpc("start_ai_generation", {
    p_project_id: projectId,
    p_kind: "video",
    p_provider: "fal",
    p_model: [FAL.trim, FAL.scale, resolved.subtitles ? FAL.subtitle : null].filter(Boolean).join(" → "),
    p_prompt: `clipper.render ${seg.id}`,
    p_params: { agent: "clipper.render", segment_id: seg.id, seconds: Math.round(clipS), subtitles: resolved.subtitles, format: resolved.format, layout: resolved.layout, style: resolved.style },
    p_credits: credits,
    p_license: CLIPPER_LICENSE,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) {
    // Sin cobro: el segmento vuelve a como estaba.
    await admin
      .from("clip_segments")
      .update({ status: seg.status as "proposed" | "failed" | "done", render_step: null, start_s: Number(seg.start_s), end_s: Number(seg.end_s), title: seg.title })
      .eq("id", seg.id);
    return { error: error.message.includes("insufficient_credits") ? "insufficient_credits" : toErrorKey(error) };
  }
  await admin.from("clip_segments").update({ generation_id: generationId }).eq("id", seg.id);
  await advanceSegment(seg.id).catch(() => undefined); // envía el primer paso
  return { ok: true };
}

/** Genera los shorts elegidos con las opciones de formato y subtítulos. Cobra cada short por separado y lo devuelve si falla. */
export async function renderSegments(input: z.input<typeof renderSchema>): Promise<Result<{ started: number }>> {
  const parsed = renderSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const admin = createAdminClient();
  if (!isFalConfigured() || !admin) return { error: "not_configured" };
  const supabase = await createClient();
  const { data: job } = await supabase.from("clip_jobs").select("id, project_id, workspace_id, status").eq("id", d.jobId).maybeSingle();
  if (!job || job.status !== "ready" || !(await canEditProject(supabase, job.workspace_id))) return { error: "forbidden" };
  const { data: segs } = await supabase.from("clip_segments").select("id, start_s, end_s, title, status").eq("job_id", job.id).in("id", d.segmentIds);
  const todo = (segs ?? []).filter((s) => s.status === "proposed" || s.status === "failed");
  if (!todo.length) return { error: "invalid_input" };

  const resolved = resolveRenderOptions(d.options, await brandFont(supabase, job.project_id));
  let started = 0;
  for (const s of todo) {
    const res = await startRender(supabase, admin, s, job.project_id, resolved);
    if ("error" in res) {
      if (res.error === "busy") continue; // otro clic ya lo lanzó
      if (started === 0) return { error: res.error };
      break; // sin saldo para más: los ya iniciados siguen
    }
    started++;
  }
  revalidate(job.project_id);
  return { ok: true, data: { started } };
}

const rerenderSchema = z.object({ segmentId: z.uuid(), start: z.number().min(0), end: z.number().positive(), title: z.string().trim().min(1).max(200), options: renderOptionsSchema });

/** Edita inicio/fin de un clip (ya generado, fallido o propuesto) y lo vuelve a renderizar, con su coste. */
export async function rerenderSegment(input: z.input<typeof rerenderSchema>): Promise<Result> {
  const parsed = rerenderSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const start = Math.round(d.start * 10) / 10;
  const end = Math.round(d.end * 10) / 10;
  if (end - start < MIN_CLIP_S || end - start > MAX_CLIP_S) return { error: "bad_range" };
  const admin = createAdminClient();
  if (!isFalConfigured() || !admin) return { error: "not_configured" };
  const supabase = await createClient();
  const { data: seg } = await supabase
    .from("clip_segments")
    .select("id, project_id, workspace_id, start_s, end_s, title, status, clip_jobs!inner(status, duration_s)")
    .eq("id", d.segmentId)
    .maybeSingle();
  if (!seg || seg.clip_jobs.status !== "ready" || !(await canEditProject(supabase, seg.workspace_id))) return { error: "forbidden" };
  if (seg.status === "rendering") return { error: "busy" };
  const duration = Number(seg.clip_jobs.duration_s ?? 0);
  if (duration && end > duration + 0.5) return { error: "bad_range" };
  const resolved = resolveRenderOptions(d.options, await brandFont(supabase, seg.project_id));
  // El clip anterior sigue en la biblioteca (no se borra): el nuevo lo sustituye en este momento.
  const res = await startRender(supabase, admin, seg, seg.project_id, resolved, { start_s: start, end_s: end, title: d.title });
  if ("error" in res) return { error: res.error };
  revalidate(seg.project_id);
  return { ok: true };
}

// -------------------------------------------------------------------------------------------------
// Programar clips: borradores en los próximos huecos libres. NUNCA publica ni aprueba.
// -------------------------------------------------------------------------------------------------
const scheduleSchema = z.object({
  projectId: z.uuid(),
  segmentIds: z.array(z.uuid()).min(1).max(8),
  accountIds: z.array(z.uuid()).min(1).max(10),
  perDay: z.number().int().min(1).max(3),
});
const scheduleRunSchema = scheduleSchema.extend({ submitForApproval: z.boolean(), idempotencyKey: z.uuid() });

async function doneClips(supabase: Supa, projectId: string, segmentIds: string[]) {
  const { data } = await supabase
    .from("clip_segments")
    .select("id, job_id, start_s, end_s, title, hook, score, asset_id, status")
    .eq("project_id", projectId)
    .in("id", segmentIds)
    .eq("status", "done")
    .not("asset_id", "is", null)
    .order("score", { ascending: false });
  return data ?? [];
}

export type SchedulePreview = { slots: { segmentId: string; scheduledAt: string }[]; unscheduled: string[]; credits: number; timezone: string };

/** Vista previa gratuita: en qué huecos caería cada clip (sin crear nada ni gastar créditos). */
export async function previewClipSchedule(input: z.input<typeof scheduleSchema>): Promise<Result<SchedulePreview>> {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const supabase = await createClient();
  const clips = await doneClips(supabase, d.projectId, d.segmentIds);
  if (!clips.length) return { error: "invalid_input" };
  const plan = await planForAccounts(supabase, { projectId: d.projectId, accountIds: [...new Set(d.accountIds)], clipIds: clips.map((c) => c.id), perDay: d.perDay });
  if ("error" in plan) return { error: plan.error ?? "invalid_input" };
  return {
    ok: true,
    data: { slots: plan.slots.map((s) => ({ segmentId: s.clipId, scheduledAt: s.scheduledAt })), unscheduled: plan.unscheduled, credits: clipCopyCredits(plan.slots.length || 1), timezone: plan.tz },
  };
}

export type ScheduleResult = { created: { segmentId: string; postId: string; scheduledAt: string; status: string }[]; unscheduled: string[] };

/**
 * Programa los clips: textos por red con IA (voz del brand kit, 1 crédito por clip, con reembolso si falla), reparto en
 * huecos libres y creación de BORRADORES con el clip como medio (o «pendiente de aprobación» si se pide y cumple las
 * reglas de cada red). La aprobación es siempre humana: nada se publica desde aquí.
 */
export async function scheduleClips(input: z.input<typeof scheduleRunSchema>): Promise<Result<ScheduleResult>> {
  const parsed = scheduleRunSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  if (!isAgentsConfigured()) return { error: "not_configured" };
  const admin = createAdminClient();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: project } = await supabase.from("projects").select("id, name, workspace_id").eq("id", d.projectId).maybeSingle();
  if (!auth.user || !project || !(await canEditProject(supabase, project.workspace_id))) return { error: "forbidden" };

  const clips = await doneClips(supabase, d.projectId, d.segmentIds);
  if (!clips.length) return { error: "invalid_input" };
  const accountIds = [...new Set(d.accountIds)];
  const plan = await planForAccounts(supabase, { projectId: d.projectId, accountIds, clipIds: clips.map((c) => c.id), perDay: d.perDay });
  if ("error" in plan) return { error: plan.error ?? "invalid_input" };
  if (!plan.slots.length) return { error: "no_slots" };
  const toSchedule = plan.slots.map((s) => ({ slot: s, clip: clips.find((c) => c.id === s.clipId)! }));
  const platforms = [...new Set(plan.accounts.map((a) => a.platform))];

  // 1) Cobro atómico de los textos (1 crédito por clip programado).
  const credits = clipCopyCredits(toSchedule.length);
  const { data: generationId, error: chargeErr } = await supabase.rpc("start_ai_generation", {
    p_project_id: d.projectId,
    p_kind: "text",
    p_provider: "anthropic",
    p_model: AGENT_MODEL,
    p_prompt: `clipper.copy: ${toSchedule.length} clips`,
    p_params: { agent: "clipper.copy", version: CLIP_COPY_VERSION, clips: toSchedule.length, platforms },
    p_credits: credits,
    p_license: { name: "Anthropic Commercial Terms", commercialUse: true },
    p_idempotency_key: d.idempotencyKey,
  });
  if (chargeErr) return { error: chargeErr.message.includes("insufficient_credits") ? "insufficient_credits" : toErrorKey(chargeErr) };

  // 2) Textos por red (solo título, gancho y extracto de la transcripción del clip).
  let copies: ClipCopy[];
  try {
    const jobIds = [...new Set(toSchedule.map((x) => x.clip.job_id))];
    const { data: jobs } = await supabase.from("clip_jobs").select("id, transcript").in("id", jobIds);
    const excerpt = (jobId: string, start: number, end: number) => {
      const chunks = (jobs ?? []).find((j) => j.id === jobId)?.transcript;
      return (Array.isArray(chunks) ? (chunks as unknown as TranscriptChunk[]) : [])
        .filter((c) => c.e > start && c.s < end)
        .map((c) => c.t)
        .join(" ");
    };
    const brand = { projectName: project.name, ...(await getBrandContext(d.projectId)) };
    copies = await writeClipCopy(
      brand,
      toSchedule.map(({ clip }) => ({ title: clip.title, hook: clip.hook, excerpt: excerpt(clip.job_id, Number(clip.start_s), Number(clip.end_s)) })),
      platforms,
      await getLocale(),
    );
    if (admin) await admin.from("ai_generations").update({ status: "succeeded", completed_at: new Date().toISOString() }).eq("id", generationId).eq("status", "running");
  } catch (e) {
    if (admin) await refundGeneration(admin, generationId, e instanceof AgentRefusalError ? "refusal" : "provider_error");
    return { error: e instanceof AgentRefusalError ? "refusal" : "provider_error" };
  }

  // 3) Borradores con el clip como medio (RLS del usuario: editor, estado draft, created_by = él).
  const { data: assets } = await supabase
    .from("assets")
    .select("id, mime_type, ai_generated")
    .eq("project_id", d.projectId)
    .in(
      "id",
      toSchedule.map((x) => x.clip.asset_id!),
    );
  const created: ScheduleResult["created"] = [];
  for (let i = 0; i < toSchedule.length; i++) {
    const { slot, clip } = toSchedule[i];
    const copy = copies[i];
    const asset = (assets ?? []).find((a) => a.id === clip.asset_id);
    if (!asset || !copy) continue;
    const textFor = (platform: string) => (platform === "tiktok" ? copy.tiktok : platform === "instagram" ? copy.instagram : platform === "youtube" ? copy.youtubeDescription : "");
    const base = (copy.instagram || copy.tiktok || copy.youtubeDescription || clip.hook || clip.title).slice(0, 5000);
    const { data: post, error } = await supabase
      .from("posts")
      .insert({
        workspace_id: project.workspace_id,
        project_id: d.projectId,
        title: (copy.youtubeTitle || clip.title).slice(0, 120),
        caption: base,
        scheduled_at: slot.scheduledAt,
        asset_ids: [asset.id],
        ai_generated: asset.ai_generated, // según los medios (el trigger posts_ai_label lo fuerza si algún medio es IA)
        created_by: auth.user.id,
      })
      .select("id")
      .single();
    if (error || !post) continue;
    const targets = plan.accounts.map((a) => {
      const options: PlatformOptions = a.platform === "youtube" ? { yt_title: copy.youtubeTitle, ...(copy.youtubeTags.length ? { yt_tags: copy.youtubeTags } : {}) } : {};
      const text = textFor(a.platform);
      return { social_account_id: a.id, platform: a.platform, text: text || base, options, override: text && text !== base ? text : null };
    });
    const { error: tErr } = await supabase
      .from("post_targets")
      .insert(targets.map((t) => ({ post_id: post.id, workspace_id: project.workspace_id, social_account_id: t.social_account_id, caption_override: t.override, platform_options: t.options as Json })));
    if (tErr) {
      await supabase.from("posts").delete().eq("id", post.id);
      continue;
    }

    let status = "draft";
    if (d.submitForApproval) {
      // Igual que «Enviar a aprobación» del editor: solo si cumple las reglas de cada red (TikTok exige elegir la
      // privacidad a mano, así que con TikTok se queda en borrador). La aprobación sigue siendo humana.
      const ok = targets.every((t) => validateTarget(t.platform, t.text, ["video"], t.options).length === 0);
      if (ok) {
        const { error: subErr } = await supabase.rpc("submit_post", { p_post_id: post.id });
        if (!subErr) status = "pending_approval";
      }
    }
    created.push({ segmentId: clip.id, postId: post.id, scheduledAt: slot.scheduledAt, status });
  }
  if (!created.length) return { error: "generic" };
  revalidatePath(`/app/p/${d.projectId}/calendar`);
  revalidatePath("/app/calendar");
  revalidate(d.projectId);
  return {
    ok: true,
    data: { created, unscheduled: [...plan.unscheduled, ...toSchedule.filter((x) => !created.some((c) => c.segmentId === x.clip.id)).map((x) => x.clip.id)] },
  };
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
