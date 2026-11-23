"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { settledPostStatus } from "@/lib/posts/settle";
import { getFreshTokens, markAccountExpired, TokenUnavailableError } from "@/lib/social/fresh-tokens";
import { queryCreatorInfo } from "@/lib/social/tiktok-api";
import { AWAITING_USER_PUBLISH, creatorBlocker, platformCode, type CreatorInfo } from "@/lib/social/tiktok-core";
import { PlatformError } from "@/lib/social/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type CreatorInfoResult =
  | { ok: true; info: CreatorInfo }
  | { ok?: false; error: "forbidden" | "reconnect" | "daily_cap" | "banned" | "client_cap" | "rate_limited" | "generic" };

/**
 * `creator_info` de TikTok al abrir el editor (Content Sharing Guidelines 1a-1c, 2b, 2c): nickname y avatar del
 * creador, privacidades permitidas, interacciones desactivadas y duración máxima. Solo lectura.
 * El access token se carga y usa en el servidor; al navegador solo llegan esos datos.
 */
export async function getTikTokCreatorInfo(projectId: string, socialAccountId: string): Promise<CreatorInfoResult> {
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(socialAccountId).success) return { error: "forbidden" };
  // RLS: solo miembros del workspace ven la cuenta; además debe ser de este proyecto y de TikTok.
  const supabase = await createClient();
  const { data: acc } = await supabase.from("social_accounts").select("id, platform, status").eq("id", socialAccountId).eq("project_id", projectId).maybeSingle();
  if (!acc || acc.platform !== "tiktok") return { error: "forbidden" };
  if (acc.status !== "active") return { error: "reconnect" };
  try {
    const tokens = await getFreshTokens(acc.id, "tiktok");
    return { ok: true, info: await queryCreatorInfo(tokens) };
  } catch (e) {
    if (e instanceof TokenUnavailableError) return { error: "reconnect" };
    if (e instanceof PlatformError) {
      const code = platformCode(e.code);
      const blocker = creatorBlocker(code);
      if (blocker) return { error: blocker };
      if (code === "access_token_invalid" || code === "scope_not_authorized" || e.status === 401) {
        if (code === "access_token_invalid") await markAccountExpired(acc.id);
        return { error: "reconnect" };
      }
      if (e.code === "rate_limited" || code === "rate_limit_exceeded") return { error: "rate_limited" };
    }
    return { error: "generic" };
  }
}

export type MarkPublishedResult = { ok: true } | { ok?: false; error: "invalid_input" | "forbidden" | "not_found" | "not_awaiting" | "generic" };

/**
 * «Ya lo he publicado»: la persona confirma que terminó en TikTok la publicación que Kreo le dejó en borradores o
 * lista para subir a mano. Solo editores o más. Se marca publicada SIN id externo (Kreo no lo publicó).
 */
export async function markTikTokPublished(projectId: string, postTargetId: string): Promise<MarkPublishedResult> {
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(postTargetId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "forbidden" };
  // RLS: el destino solo es visible para miembros del workspace.
  const { data: target } = await supabase.from("post_targets").select("id, post_id, status, social_accounts(platform)").eq("id", postTargetId).maybeSingle();
  if (!target) return { error: "not_found" };
  const { data: post } = await supabase.from("posts").select("id, workspace_id, project_id").eq("id", target.post_id).eq("project_id", projectId).maybeSingle();
  if (!post) return { error: "not_found" };
  const { data: isEditor } = await supabase.rpc("has_workspace_role", { p_workspace_id: post.workspace_id, p_min_role: "editor" });
  if (!isEditor) return { error: "forbidden" };
  if (target.social_accounts?.platform !== "tiktok" || target.status !== AWAITING_USER_PUBLISH) return { error: "not_awaiting" };

  // El estado solo lo cambia el servidor (los triggers lo impiden desde el cliente).
  const db = createAdminClient();
  if (!db) return { error: "generic" };
  const { data: changed } = await db
    .from("post_targets")
    .update({ status: "published", published_at: new Date().toISOString(), external_post_id: null, external_url: null, error_code: null })
    .eq("id", target.id)
    .eq("status", AWAITING_USER_PUBLISH)
    .select("id");
  if (!changed?.length) return { error: "not_awaiting" };
  const { data: all } = await db.from("post_targets").select("status").eq("post_id", post.id);
  const status = settledPostStatus((all ?? []).map((t) => t.status));
  if (status) await db.from("posts").update({ status }).eq("id", post.id);
  revalidatePath(`/app/p/${projectId}/calendar`);
  revalidatePath(`/app/p/${projectId}/posts/${post.id}`);
  return { ok: true };
}
