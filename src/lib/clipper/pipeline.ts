import "server-only";
import { downloadFalFile, falResultJson, falStatus, falSubmit, isFalFileUrl } from "@/lib/ai/providers/fal";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { detectHighlights } from "./highlights";
import { normalizeTranscript, toSrt, transcriptDuration, wordsToSrt, type TranscriptChunk } from "./segments";
import { CLIP_FORMATS, parseRenderOptions, resolveRenderOptions, scaleInput, subtitleInput, type ResolvedRender } from "./styles";

/**
 * Pipeline del Clipper (todo asíncrono con la cola de fal.ai + consultas periódicas, igual que el vídeo del Estudio):
 *  1. Transcripción: fal-ai/whisper (Whisper large v3, "Commercial use" en fal) → trozos con tiempos.
 *  2. Mejores momentos: Claude (runStructured) → segmentos con inicio/fin/título/hook/puntuación.
 *  3. Por cada short elegido: recorte (workflow-utilities/trim-video) → formato 9:16, 1:1 o 16:9 con recorte centrado
 *     o encajado con bandas (workflow-utilities/scale-video, mode=crop|pad) → subtítulos quemados con una plantilla y los
 *     colores del brand kit (workflow-utilities/auto-subtitle). Al guardar, el .srt del clip queda en clip_segments.srt.
 *     Endpoints verificados en fal.ai (API de modelos, license_type = "commercial") el 2026-11-23.
 *
 * SIN MARCA DE AGUA: ningún paso añade marca de agua, logo ni texto de Kreo. Los únicos endpoints que se llaman son los
 * de FAL (lista cerrada) con los parámetros de styles.ts; ninguno tiene opción de marca de agua y no se añade ninguna capa.
 * Lo comprueba tests/unit/clipper-v2.test.ts («sin marca de agua»). Si se añade un paso nuevo, debe pasar ese test.
 * Lo avanzan tanto el navegador (polling) como una tarea de Inngest cada 2 min, con bloqueo optimista para no
 * procesar dos veces. Si falla tras cobrar, se devuelven los créditos.
 */
export const FAL = {
  whisper: "fal-ai/whisper",
  trim: "fal-ai/workflow-utilities/trim-video",
  scale: "fal-ai/workflow-utilities/scale-video",
  subtitle: "fal-ai/workflow-utilities/auto-subtitle",
} as const;

export const CLIPPER_LICENSE = {
  name: "fal.ai · Commercial use (Whisper, workflow-utilities trim/scale/auto-subtitle) + Anthropic Commercial Terms",
  url: "https://fal.ai/legal/terms-of-service",
  commercialUse: true,
  endpoints: {
    [FAL.whisper]: "commercial (fal.ai, Whisper large v3, MIT)",
    [FAL.trim]: "commercial (fal.ai, utilidad FFmpeg)",
    [FAL.scale]: "commercial (fal.ai, utilidad FFmpeg)",
    [FAL.subtitle]: "commercial (fal.ai; transcribe con ElevenLabs a través de fal)",
  },
  verifiedAt: "2026-11-23",
  notes:
    "Procesa SOLO vídeo propio o con derechos (nunca descargado de otras plataformas). Los subtítulos son transcripción del audio original (no es contenido sintético). Sin marca de agua.",
};

const TRANSCRIBE_TIMEOUT_MS = 45 * 60_000;
const STEP_TIMEOUT_MS = 30 * 60_000;
const LOCK_MS = 3 * 60_000;
const SIGNED_URL_S = 6 * 3600;

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
type JobState = { status_url?: string; response_url?: string; submitted_at?: string; locale?: string; lock?: string; attempts?: number };
type SegState = {
  status_url?: string;
  response_url?: string;
  submitted_at?: string;
  input_url?: string;
  lock?: string;
  /** Solo renders antiguos (antes de render_options). */
  style?: { font_color: string; highlight_color: string; stroke_color: string; font_name: string };
};

function db(): Admin {
  const a = createAdminClient();
  if (!a) throw new Error("not_configured");
  return a;
}

export async function refundGeneration(admin: Admin, generationId: string | null, code: string) {
  if (!generationId) return;
  const { data: gen } = await admin
    .from("ai_generations")
    .update({ status: "refunded", error_code: code, completed_at: new Date().toISOString() })
    .eq("id", generationId)
    .eq("status", "running")
    .select("workspace_id, credits_cost")
    .maybeSingle();
  if (!gen || gen.credits_cost <= 0) return;
  await admin.rpc("grant_credits", {
    p_workspace_id: gen.workspace_id,
    p_amount: gen.credits_cost,
    p_reason: "refund_ai_failure",
    p_idempotency_key: `refund:${generationId}`,
    p_ref_type: "ai_generation",
    p_ref_id: generationId,
  });
}

async function succeed(admin: Admin, generationId: string | null) {
  if (generationId) await admin.from("ai_generations").update({ status: "succeeded", completed_at: new Date().toISOString() }).eq("id", generationId).eq("status", "running");
}

/** Bloqueo optimista: solo un proceso avanza el paso (updated_at cambia en cada escritura). */
async function claim(admin: Admin, table: "clip_jobs" | "clip_segments", row: { id: string; updated_at: string; provider_state: Json }) {
  const state = (row.provider_state ?? {}) as { lock?: string };
  if (state.lock && Date.now() - new Date(state.lock).getTime() < LOCK_MS) return null;
  const next = { ...state, lock: new Date().toISOString() };
  const { data } = await admin.from(table).update({ provider_state: next as Json }).eq("id", row.id).eq("updated_at", row.updated_at).select("id");
  return data?.length ? next : null;
}

async function signedSource(admin: Admin, assetId: string | null) {
  if (!assetId) throw new Error("source_missing");
  const { data: a } = await admin.from("assets").select("storage_path").eq("id", assetId).maybeSingle();
  if (!a) throw new Error("source_missing");
  const { data } = await admin.storage.from("project-media").createSignedUrl(a.storage_path, SIGNED_URL_S);
  if (!data?.signedUrl) throw new Error("source_missing");
  return data.signedUrl;
}

async function brandFor(admin: Admin, projectId: string) {
  const [{ data: project }, { data: kit }] = await Promise.all([
    admin.from("projects").select("name").eq("id", projectId).single(),
    admin.from("brand_kits").select("tone_of_voice, target_audience, banned_words, colors").eq("project_id", projectId).maybeSingle(),
  ]);
  const colors = Array.isArray(kit?.colors) ? (kit!.colors as { hex?: string }[]).map((c) => c.hex).filter((x): x is string => Boolean(x)) : [];
  return { projectName: project?.name ?? "", tone: kit?.tone_of_voice ?? "", audience: kit?.target_audience ?? "", bannedWords: kit?.banned_words ?? [], colors };
}

/** Envía la transcripción a la cola de fal. */
export async function submitTranscription(jobId: string) {
  const admin = db();
  const { data: job } = await admin.from("clip_jobs").select("id, source_asset_id, provider_state").eq("id", jobId).single();
  if (!job) throw new Error("not_found");
  const audioUrl = await signedSource(admin, job.source_asset_id);
  const t = await falSubmit(FAL.whisper, { audio_url: audioUrl, task: "transcribe", chunk_level: "segment" });
  await admin
    .from("clip_jobs")
    .update({ provider_state: { ...((job.provider_state as JobState) ?? {}), status_url: t.statusUrl, response_url: t.responseUrl, submitted_at: new Date().toISOString() } as Json })
    .eq("id", jobId);
}

async function failJob(admin: Admin, job: { id: string; generation_id: string | null }, code: string) {
  await admin.from("clip_jobs").update({ status: "failed", error_code: code, provider_state: {} }).eq("id", job.id);
  await refundGeneration(admin, job.generation_id, code);
}

/** Avanza un trabajo (transcribiendo → analizando → listo). Idempotente y seguro con varias llamadas a la vez. */
export async function advanceJob(jobId: string): Promise<string> {
  const admin = db();
  const { data: job } = await admin
    .from("clip_jobs")
    .select("id, project_id, status, declared_duration_s, generation_id, provider_state, transcript, duration_s, created_at, updated_at")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return "failed";
  const st = (job.provider_state ?? {}) as JobState;

  if (job.status === "transcribing") {
    if (!st.status_url || !st.response_url) {
      if (Date.now() - new Date(job.created_at).getTime() > 10 * 60_000) await failJob(admin, job, "submit_failed");
      return job.status;
    }
    const s = await falStatus(st.status_url).catch(() => "ERROR" as const);
    if (s === "IN_QUEUE" || s === "IN_PROGRESS") {
      if (Date.now() - new Date(st.submitted_at ?? job.created_at).getTime() > TRANSCRIBE_TIMEOUT_MS) await failJob(admin, job, "timeout");
      return job.status;
    }
    const locked = await claim(admin, "clip_jobs", job);
    if (!locked) return job.status;
    if (s !== "COMPLETED") {
      await failJob(admin, job, "transcription_failed");
      return "failed";
    }
    try {
      const out = await falResultJson<{ text?: string; chunks?: { timestamp?: (number | null)[]; text?: string }[]; inferred_languages?: string[] }>(st.response_url);
      const chunks = normalizeTranscript(out.chunks);
      if (!chunks.length) {
        await failJob(admin, job, "no_speech");
        return "failed";
      }
      const duration = transcriptDuration(chunks);
      // El coste se calculó con la duración declarada por el navegador: si el vídeo es bastante más largo, se detiene.
      if (duration > Number(job.declared_duration_s) * 1.15 + 30) {
        await failJob(admin, job, "duration_mismatch");
        return "failed";
      }
      await admin
        .from("clip_jobs")
        .update({
          status: "analyzing",
          transcript: chunks as unknown as Json,
          duration_s: Math.round(duration * 10) / 10,
          language: (out.inferred_languages?.[0] ?? "").slice(0, 10) || null,
          provider_state: { locale: st.locale, attempts: 0 } as Json,
        })
        .eq("id", job.id);
    } catch {
      await failJob(admin, job, "transcription_failed");
      return "failed";
    }
    return analyze(jobId);
  }

  if (job.status === "analyzing") return analyze(jobId);
  return job.status;
}

async function analyze(jobId: string): Promise<string> {
  const admin = db();
  const { data: job } = await admin.from("clip_jobs").select("id, project_id, workspace_id, status, generation_id, provider_state, transcript, duration_s, updated_at").eq("id", jobId).single();
  if (!job || job.status !== "analyzing") return job?.status ?? "failed";
  const locked = await claim(admin, "clip_jobs", job);
  if (!locked) return job.status;
  const st = locked as JobState;
  if ((st.attempts ?? 0) >= 2) {
    await failJob(admin, job, "analysis_failed");
    return "failed";
  }
  await admin.from("clip_jobs").update({ provider_state: { ...st, attempts: (st.attempts ?? 0) + 1 } as Json }).eq("id", job.id);
  try {
    const chunks = (job.transcript ?? []) as unknown as TranscriptChunk[];
    const brand = await brandFor(admin, job.project_id);
    const segments = await detectHighlights(brand, chunks, Number(job.duration_s ?? transcriptDuration(chunks)), st.locale ?? "es");
    if (segments.length) {
      await admin.from("clip_segments").insert(
        segments.map((s) => ({
          job_id: job.id,
          workspace_id: job.workspace_id,
          project_id: job.project_id,
          start_s: s.start,
          end_s: s.end,
          title: s.title,
          hook: s.hook || null,
          reason: s.reason || null,
          score: s.score,
          score_breakdown: (s.breakdown ?? {}) as Json,
        })),
      );
    }
    await admin.from("clip_jobs").update({ status: "ready", provider_state: {} }).eq("id", job.id);
    await succeed(admin, job.generation_id);
    return "ready";
  } catch (e) {
    console.error("[clipper] análisis falló", (e as Error).message?.slice(0, 60));
    // Se reintenta en la siguiente consulta (máx. 2 intentos); quitamos el bloqueo.
    const { data: cur } = await admin.from("clip_jobs").select("provider_state").eq("id", job.id).single();
    await admin.from("clip_jobs").update({ provider_state: { ...((cur?.provider_state as JobState) ?? {}), lock: undefined } as Json }).eq("id", job.id);
    return "analyzing";
  }
}

// -------------------------------------------------------------------------------------------------
// Render de shorts
// -------------------------------------------------------------------------------------------------
type SegRow = {
  id: string;
  job_id: string;
  workspace_id: string;
  project_id: string;
  start_s: number;
  end_s: number;
  title: string;
  status: string;
  render_step: "trim" | "scale" | "subtitle" | null;
  subtitles: boolean;
  generation_id: string | null;
  provider_state: Json;
  render_options: Json;
  updated_at: string;
};

/** Opciones de render del segmento (las antiguas sin render_options usan 9:16 centrado + su estilo guardado). */
function renderOptionsOf(row: SegRow, st: SegState): ResolvedRender {
  const raw = (row.render_options ?? {}) as Partial<ResolvedRender>;
  if (raw.accentNamed && raw.fontName) return { ...parseRenderOptions(raw), subtitles: row.subtitles, accentNamed: raw.accentNamed, fontName: raw.fontName };
  const base = parseRenderOptions({ ...raw, subtitles: row.subtitles, ...(st.style ? { accent: st.style.highlight_color } : {}) });
  return resolveRenderOptions(base, st.style?.font_name);
}

async function failSegment(admin: Admin, seg: { id: string; generation_id: string | null }, code: string) {
  await admin.from("clip_segments").update({ status: "failed", error_code: code, provider_state: {} }).eq("id", seg.id);
  await refundGeneration(admin, seg.generation_id, code);
}

/** Entrada de cada paso (lista cerrada de endpoints y parámetros; ver «sin marca de agua» arriba). */
export function stepInput(step: "trim" | "scale" | "subtitle", inputUrl: string, seg: { start_s: number; end_s: number }, r: ResolvedRender, language: string | null): Record<string, unknown> {
  if (step === "trim") return { video_url: inputUrl, start_time: Number(seg.start_s), end_time: Number(seg.end_s) };
  if (step === "scale") return scaleInput(inputUrl, r);
  return subtitleInput(inputUrl, r, language);
}

async function submitStep(admin: Admin, seg: SegRow, step: "trim" | "scale" | "subtitle", inputUrl: string, st: SegState, language: string | null) {
  const t = await falSubmit(FAL[step], stepInput(step, inputUrl, seg, renderOptionsOf(seg, st), language));
  const next: SegState = { style: st.style, input_url: inputUrl, status_url: t.statusUrl, response_url: t.responseUrl, submitted_at: new Date().toISOString() };
  await admin.from("clip_segments").update({ render_step: step, provider_state: next as Json }).eq("id", seg.id);
}

async function finalize(admin: Admin, seg: SegRow, url: string, r: ResolvedRender, words: unknown) {
  const { bytes } = await downloadFalFile(url, 50 * 1024 * 1024);
  const { width, height } = CLIP_FORMATS[r.format];
  const path = `${seg.workspace_id}/${seg.project_id}/${crypto.randomUUID()}.mp4`;
  const up = await admin.storage.from("project-media").upload(path, bytes, { contentType: "video/mp4" });
  if (up.error) throw new Error("storage_failed");
  const { data: gen } = seg.generation_id ? await admin.from("ai_generations").select("created_by").eq("id", seg.generation_id).maybeSingle() : { data: null };
  // Clip de un vídeo PROPIO con subtítulos de transcripción: no es contenido sintético → ai_generated = false.
  const { data: asset, error } = await admin
    .from("assets")
    .insert({
      workspace_id: seg.workspace_id,
      project_id: seg.project_id,
      storage_path: path,
      mime_type: "video/mp4",
      size_bytes: bytes.byteLength,
      width,
      height,
      duration_seconds: Math.round((Number(seg.end_s) - Number(seg.start_s)) * 10) / 10,
      source: "upload",
      ai_generated: false,
      created_by: gen?.created_by ?? null,
    })
    .select("id")
    .single();
  if (error || !asset) throw new Error("asset_failed");
  // Subtítulos .srt del clip (tiempos relativos al clip) junto al asset, para subirlos como subtítulos (p. ej. a YouTube):
  // primero las palabras con tiempos de auto-subtitle; si no hay, la transcripción de Whisper del tramo.
  let srt = wordsToSrt(words);
  if (!srt) {
    const { data: job } = await admin.from("clip_jobs").select("transcript").eq("id", seg.job_id).single();
    srt = toSrt(Array.isArray(job?.transcript) ? (job!.transcript as unknown as TranscriptChunk[]) : [], Number(seg.start_s), Number(seg.end_s));
  }
  await admin
    .from("clip_segments")
    .update({ status: "done", asset_id: asset.id, render_step: null, provider_state: {}, error_code: null, srt: srt ? srt.slice(0, 200_000) : null, rendered_at: new Date().toISOString() })
    .eq("id", seg.id);
  await succeed(admin, seg.generation_id);
}

/** Avanza el render de un short (recorte → 9:16 → subtítulos → guardar). */
export async function advanceSegment(segmentId: string): Promise<string> {
  const admin = db();
  const { data: seg } = await admin
    .from("clip_segments")
    .select("id, job_id, workspace_id, project_id, start_s, end_s, title, status, render_step, subtitles, generation_id, provider_state, render_options, updated_at")
    .eq("id", segmentId)
    .maybeSingle();
  if (!seg || seg.status !== "rendering") return seg?.status ?? "failed";
  const row = seg as SegRow;
  const st = (row.provider_state ?? {}) as SegState;
  const step = row.render_step ?? "trim";

  try {
    // Paso aún no enviado (inicio del render).
    if (!st.status_url || !st.response_url) {
      const locked = await claim(admin, "clip_segments", row);
      if (!locked) return row.status;
      const { data: job } = await admin.from("clip_jobs").select("source_asset_id").eq("id", row.job_id).single();
      await submitStep(admin, row, "trim", await signedSource(admin, job?.source_asset_id ?? null), st, null);
      return "rendering";
    }

    const s = await falStatus(st.status_url).catch(() => "ERROR" as const);
    if (s === "IN_QUEUE" || s === "IN_PROGRESS") {
      if (Date.now() - new Date(st.submitted_at ?? row.updated_at).getTime() > STEP_TIMEOUT_MS) await failSegment(admin, row, "timeout");
      return "rendering";
    }
    const locked = await claim(admin, "clip_segments", row);
    if (!locked) return row.status;
    if (s !== "COMPLETED") {
      await failSegment(admin, row, `${step}_failed`);
      return "failed";
    }
    const out = await falResultJson<{ video?: { url?: string }; words?: unknown }>(st.response_url);
    const url = out.video?.url;
    if (!url || !isFalFileUrl(url)) throw new Error(`${step}_empty`);

    if (step === "trim") {
      await submitStep(admin, row, "scale", url, st, null);
      return "rendering";
    }
    if (step === "scale" && row.subtitles) {
      const { data: job } = await admin.from("clip_jobs").select("language").eq("id", row.job_id).single();
      await submitStep(admin, row, "subtitle", url, st, job?.language ?? null);
      return "rendering";
    }
    await finalize(admin, row, url, renderOptionsOf(row, st), step === "subtitle" ? out.words : null);
    return "done";
  } catch (e) {
    console.error("[clipper] render falló", (e as Error).message?.slice(0, 60));
    await failSegment(admin, row, `${step}_failed`);
    return "failed";
  }
}

/**
 * Subtítulos .srt de un clip generado, a partir del id de su asset (para el módulo que los sube a YouTube como
 * subtítulos con captions.insert). Dónde están: columna `clip_segments.srt` (texto SRT, tiempos relativos al clip),
 * fila con `clip_segments.asset_id = <asset del clip>`. Devuelve null si el asset no es un clip o no tiene .srt.
 */
export async function getClipSrtForAsset(assetId: string): Promise<{ srt: string; language: string | null } | null> {
  const admin = db();
  const { data } = await admin.from("clip_segments").select("srt, clip_jobs!inner(language)").eq("asset_id", assetId).not("srt", "is", null).limit(1).maybeSingle();
  if (!data?.srt) return null;
  return { srt: data.srt, language: data.clip_jobs?.language ?? null };
}
