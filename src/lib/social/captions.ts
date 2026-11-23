import "server-only";
import { toSrt, type TranscriptChunk } from "@/lib/clipper/segments";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Subtítulos (.srt) asociados a un vídeo, para subirlos a YouTube con captions.insert al publicar.
 *
 * CONVENCIÓN (para cualquier módulo que genere subtítulos, p. ej. el Clipper):
 *  1. «Archivo hermano» en el bucket `project-media`: MISMA ruta que el vídeo cambiando la extensión por `.srt`
 *     (`{workspace}/{project}/{uuid}.mp4` → `{workspace}/{project}/{uuid}.srt`), UTF-8 y content-type
 *     `application/x-subrip` (permitido en el bucket desde la migración 20261124120000_notifications.sql).
 *     No hace falta fila en `assets`. Tiempos relativos al inicio de ESE vídeo.
 *  2. Si no existe y el vídeo es un short del Clipper (`clip_segments.asset_id`): su `.srt` guardado (`clip_segments.srt`,
 *     el mismo texto que lleva el clip incrustado y que la persona vio al aprobar; si el clip no lleva subtítulos
 *     incrustados, borrador) o, si no hay, el tramo de la
 *     transcripción guardada (`clip_jobs.transcript`).
 *  3. Si es el vídeo fuente de un trabajo del Clipper (`clip_jobs.source_asset_id`): la transcripción completa.
 *     Nadie la ha revisado (es reconocimiento automático de voz) → se sube como BORRADOR de YouTube (`draft: true`):
 *     el creador la revisa y la publica en YouTube Studio (regla nº 1: la IA propone, la persona aprueba).
 * Si no hay ninguno, no se suben subtítulos. Tamaño máximo: 512 KB.
 */
type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
export const SRT_MAX_BYTES = 512 * 1024;

export function srtSiblingPath(storagePath: string) {
  return storagePath.replace(/\.[A-Za-z0-9]+$/, "") + ".srt";
}

/** Normaliza el idioma para YouTube (BCP-47 sencillo); por defecto "es". */
export function captionLanguage(lang: string | null | undefined) {
  const l = (lang ?? "").trim();
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(l) ? l : "es";
}

/** `draft`: subir como borrador de YouTube (no visible para el público hasta que el creador lo publique en Studio). */
export type FoundSrt = { srt: string; draft: boolean };

export async function findSrtForVideo(db: Admin, video: { id: string; storage_path: string }): Promise<FoundSrt | null> {
  // 1) Archivo hermano .srt (subido por la persona)
  const { data: file } = await db.storage.from("project-media").download(srtSiblingPath(video.storage_path));
  if (file && file.size > 0 && file.size <= SRT_MAX_BYTES) {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    if (text.trim()) return { srt: text, draft: false };
  }
  // 2) Short del Clipper → su .srt (lo que lleva incrustado) o el tramo de la transcripción
  const { data: seg } = await db.from("clip_segments").select("job_id, start_s, end_s, srt, subtitles").eq("asset_id", video.id).limit(1).maybeSingle();
  if (seg) {
    // Con subtítulos incrustados, el .srt es el texto que ya se ve en el vídeo aprobado; sin ellos, nadie lo ha visto.
    if (seg.srt?.trim()) return { srt: seg.srt, draft: !seg.subtitles };
    const { data: job } = await db.from("clip_jobs").select("transcript").eq("id", seg.job_id).maybeSingle();
    const srt = toSrt((job?.transcript ?? []) as unknown as TranscriptChunk[], Number(seg.start_s), Number(seg.end_s));
    return srt.trim() ? { srt, draft: true } : null;
  }
  // 3) Vídeo fuente de un trabajo del Clipper → transcripción completa, sin revisar → borrador
  const { data: job } = await db.from("clip_jobs").select("transcript").eq("source_asset_id", video.id).not("transcript", "is", null).limit(1).maybeSingle();
  if (job) {
    const srt = toSrt((job.transcript ?? []) as unknown as TranscriptChunk[]);
    return srt.trim() ? { srt, draft: true } : null;
  }
  return null;
}
