"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appUrl } from "@/lib/env";
import type { PlatformOptions } from "@/lib/posts/rules";
import { settledPostStatus } from "@/lib/posts/settle";
import { getFreshTokens, markAccountExpired, TokenUnavailableError } from "@/lib/social/fresh-tokens";
import { applyYouTubeExtras } from "@/lib/social/publish";
import { PlatformError } from "@/lib/social/types";
import { getUploadedVideo, loadYouTubeThumbnail, startYouTubeResumableSession, YouTubeDirectError } from "@/lib/social/youtube-direct";
import { buildYouTubeVideoResource, resolvePublishAt, YT_MAX_BYTES, youtubeInsertUrl } from "@/lib/social/youtube-upload-core";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Subida directa navegador → YouTube para vídeos grandes (no pasan por Kreo).
 * Regla nº 1: solo la lanza quien puede APROBAR (admin u owner) y solo sobre un destino ya aprobado con `approve_post`
 * (límites diarios y anti-baneo incluidos). El access token nunca va al navegador: solo la URL de la sesión.
 */
export type DirectStartResult =
  | { ok: true; sessionUrl: string; targetId: string; scheduledOnPlatform: boolean }
  | { ok?: false; error: string };
export type DirectCompleteResult = { ok: true; status: "published" | "scheduled_on_platform"; url: string; warnings: string[] } | { ok?: false; error: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;

/** Carga el destino con las comprobaciones comunes: rol admin, YouTube, subida directa y post aprobado. */
async function loadDirectTarget(where: { postId: string; socialAccountId: string } | { targetId: string }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "forbidden" as const };
  // RLS: solo miembros del workspace ven el destino.
  let q = supabase
    .from("post_targets")
    .select("id, post_id, status, platform_options, caption_override, external_post_id, social_account_id, social_accounts(id, platform, status, external_id)");
  q = "targetId" in where ? q.eq("id", where.targetId) : q.eq("post_id", where.postId).eq("social_account_id", where.socialAccountId);
  const { data: target } = await q.maybeSingle();
  if (!target) return { error: "not_found" as const };
  const { data: post } = await supabase
    .from("posts")
    .select("id, workspace_id, project_id, caption, ai_generated, status, scheduled_at, approved_by")
    .eq("id", target.post_id)
    .maybeSingle();
  if (!post) return { error: "not_found" as const };
  const { data: isAdmin } = await supabase.rpc("has_workspace_role", { p_workspace_id: post.workspace_id, p_min_role: "admin" });
  if (!isAdmin) return { error: "forbidden" as const };
  const account = target.social_accounts;
  const options = (target.platform_options ?? {}) as PlatformOptions;
  if (!account || account.platform !== "youtube" || !options.yt_direct_upload) return { error: "not_direct" as const };
  // Aprobación humana previa obligatoria (approve_post deja approved_by y el estado approved/scheduled).
  if (!post.approved_by || !["approved", "scheduled", "publishing"].includes(post.status)) return { error: "not_approved" as const };
  return { target, post, account, options };
}

function tokenError(e: unknown) {
  return e instanceof TokenUnavailableError ? "reconnect" : null;
}

export async function startYouTubeDirectUpload(postId: string, socialAccountId: string, size: number, mime: string): Promise<DirectStartResult> {
  const parsed = z
    .object({ postId: z.uuid(), socialAccountId: z.uuid(), size: z.number().int().positive().max(YT_MAX_BYTES), mime: z.string().regex(/^video\/[a-z0-9.+-]+$/i).max(100) })
    .safeParse({ postId, socialAccountId, size, mime });
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await loadDirectTarget({ postId, socialAccountId });
  if (ctx.error) return { error: ctx.error };
  const { target, post, account, options } = ctx;
  if (!["approved", "scheduled"].includes(target.status) || target.external_post_id) return { error: "already_uploaded" };
  if (account.status !== "active") return { error: "reconnect" };
  // Se aprobó ESTE archivo (nombre, tamaño y tipo guardados en el destino): otro archivo exige volver a aprobar.
  const declared = options.yt_direct_upload!;
  if (declared.size_bytes !== size || declared.mime !== mime) return { error: "file_mismatch" };

  const publishAt = resolvePublishAt(post.scheduled_at, options.yt_privacy);
  const resource = buildYouTubeVideoResource({ options, caption: target.caption_override ?? post.caption, aiGenerated: post.ai_generated, publishAt });
  try {
    const tokens = await getFreshTokens(account.id, "youtube");
    const sessionUrl = await startYouTubeResumableSession(tokens, { url: youtubeInsertUrl(options), resource, size, mime, origin: appUrl() });
    return { ok: true, sessionUrl, targetId: target.id, scheduledOnPlatform: Boolean(publishAt) };
  } catch (e) {
    const tk = tokenError(e);
    if (tk) return { error: tk };
    if (e instanceof YouTubeDirectError) {
      if (e.status === 401) await markAccountExpired(account.id);
      return { error: e.key };
    }
    if (e instanceof PlatformError && e.code === "rate_limited") return { error: "quota" };
    return { error: "generic" };
  }
}

export async function completeYouTubeDirectUpload(targetId: string, videoId: string): Promise<DirectCompleteResult> {
  if (!z.uuid().safeParse(targetId).success || !VIDEO_ID.test(videoId)) return { error: "invalid_input" };
  const ctx = await loadDirectTarget({ targetId });
  if (ctx.error) return { error: ctx.error };
  const { target, post, account, options } = ctx;
  if (target.external_post_id && target.external_post_id !== videoId) return { error: "already_uploaded" };
  if (target.external_post_id === videoId && !["approved", "scheduled"].includes(target.status)) {
    return { ok: true, status: target.status === "scheduled_on_platform" ? "scheduled_on_platform" : "published", url: `https://www.youtube.com/watch?v=${videoId}`, warnings: [] };
  }
  const db = createAdminClient();
  if (!db) return { error: "generic" };

  let tokens;
  try {
    tokens = await getFreshTokens(account.id, "youtube");
  } catch (e) {
    return { error: tokenError(e) ?? "generic" };
  }

  // 1) El vídeo existe y es del canal conectado (no se acepta un id cualquiera desde el navegador).
  let video;
  try {
    video = await getUploadedVideo(tokens, videoId);
  } catch (e) {
    if (e instanceof YouTubeDirectError) {
      if (e.status === 401) await markAccountExpired(account.id);
      return { error: e.key };
    }
    return { error: "generic" };
  }
  if (!video || video.channelId !== account.external_id) return { error: "not_on_channel" };
  if (video.uploadStatus === "rejected" || video.uploadStatus === "failed") {
    // p. ej. rejectionReason "length": más de 15 min en una cuenta sin verificar.
    const code = video.uploadStatus === "rejected" ? `rejected_${video.rejectionReason ?? "unknown"}` : `failed_${video.failureReason ?? "unknown"}`;
    await db.from("post_targets").update({ status: "failed", external_post_id: videoId, error_code: code.slice(0, 120) }).eq("id", target.id);
    await settle(db, post.id);
    revalidate(post.project_id);
    return { error: video.rejectionReason === "length" ? "too_long" : "rejected" };
  }

  // 2) Pasos opcionales (los mismos que el worker): miniatura y lista de reproducción. Los fallos son avisos.
  const thumbnail = options.yt_thumbnail_asset_id ? await loadYouTubeThumbnail(db, options.yt_thumbnail_asset_id, post.project_id) : undefined;
  const warnings = await applyYouTubeExtras(tokens, videoId, { options, thumbnail }).catch(() => ["extras_failed"]);

  // 3) Estado: programado en YouTube (publishAt futuro) o publicado.
  const scheduled = Boolean(video.publishAt && new Date(video.publishAt).getTime() > Date.now());
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  await db
    .from("post_targets")
    .update({
      status: scheduled ? "scheduled_on_platform" : "published",
      external_post_id: videoId,
      external_url: url,
      published_at: scheduled ? null : new Date().toISOString(),
      attempts: 1,
      error_code: warnings.length ? `warn:${warnings.join(",")}`.slice(0, 120) : null,
    })
    .eq("id", target.id);
  await settle(db, post.id);
  revalidate(post.project_id);
  return { ok: true, status: scheduled ? "scheduled_on_platform" : "published", url, warnings };
}

async function settle(db: NonNullable<ReturnType<typeof createAdminClient>>, postId: string) {
  const { data: targets } = await db.from("post_targets").select("status").eq("post_id", postId);
  const status = settledPostStatus((targets ?? []).map((t) => t.status));
  if (status) await db.from("posts").update({ status }).eq("id", postId);
}

function revalidate(projectId: string) {
  revalidatePath(`/app/p/${projectId}/calendar`);
  revalidatePath(`/app/p/${projectId}`);
  revalidatePath("/app/calendar");
}
