"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AgentRefusalError, isAgentsConfigured } from "@/lib/agents";
import { COMMUNITY_VERSION, suggestReply } from "@/lib/agents/community";
import { getBrandContext } from "@/lib/ai/brand-context";
import { replyToComment, setCommentHidden } from "@/lib/inbox/comment-reply";
import { COMMENT_MAX_LENGTH } from "@/lib/inbox/comments";
import { InboxError } from "@/lib/inbox/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Acciones de los comentarios de Instagram en la Bandeja. Todas parten de un clic humano: Kreo no responde, oculta,
 * da «me gusta» ni sigue a nadie por su cuenta. La IA solo propone un borrador que la persona revisa y envía.
 */
type Result<T = undefined> = { ok: true; data?: T } | { ok?: false; error: string };

const REPLY_CREDITS = 1;
const uuid = z.uuid();
const errorOf = (e: unknown) => (e instanceof InboxError ? e.code : "generic");
const revalidate = (projectId: string) => revalidatePath(`/app/p/${projectId}/inbox`);

/** Comprueba con la SESIÓN del usuario (RLS + rol) que puede actuar sobre el comentario o la publicación. */
async function authorize(kind: "comment" | "media", id: string, minRole: "editor" | "viewer" = "editor") {
  if (!uuid.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: row } =
    kind === "comment"
      ? await supabase.from("inbox_comments").select("id, workspace_id, project_id").eq("id", id).maybeSingle()
      : await supabase.from("inbox_comment_media").select("id, workspace_id, project_id").eq("id", id).maybeSingle();
  if (!row) return null;
  const { data: ok } = await supabase.rpc("has_workspace_role", { p_workspace_id: row.workspace_id, p_min_role: minRole });
  if (!ok) return null;
  return { ...row, userId: auth.user.id, supabase };
}

/** Marca un comentario como leído o no leído (solo en Kreo: Instagram no tiene estado de lectura de comentarios). */
export async function markCommentRead(commentId: string, unread = false): Promise<Result> {
  if (typeof unread !== "boolean") return { error: "invalid_input" };
  const a = await authorize("comment", commentId);
  if (!a) return { error: "forbidden" };
  const { error } = await a.supabase.from("inbox_comments").update({ unread }).eq("id", commentId);
  if (error) return { error: "forbidden" };
  revalidate(a.project_id);
  return { ok: true };
}

/** Marca como leídos todos los comentarios de una publicación. */
export async function markMediaCommentsRead(mediaId: string): Promise<Result<number>> {
  const a = await authorize("media", mediaId);
  if (!a) return { error: "forbidden" };
  const { data, error } = await a.supabase.from("inbox_comments").update({ unread: false }).eq("media_id", mediaId).eq("unread", true).select("id");
  if (error) return { error: "forbidden" };
  revalidate(a.project_id);
  return { ok: true, data: data?.length ?? 0 };
}

export async function setCommentHiddenAction(commentId: string, hide: boolean): Promise<Result> {
  if (typeof hide !== "boolean") return { error: "invalid_input" };
  const a = await authorize("comment", commentId);
  if (!a) return { error: "forbidden" };
  try {
    await setCommentHidden({ commentId, hide });
    revalidate(a.project_id);
    return { ok: true };
  } catch (e) {
    console.error(`[inbox] ocultar comentario falló: ${errorOf(e)}`);
    return { error: errorOf(e) };
  }
}

/** Publica la respuesta. SOLO desde el botón «Responder» (acción humana explícita). */
export async function replyToCommentAction(commentId: string, body: string, aiAssisted: boolean): Promise<Result> {
  const parsed = z.object({ body: z.string().trim().min(1).max(COMMENT_MAX_LENGTH), ai: z.boolean() }).safeParse({ body, ai: aiAssisted });
  if (!parsed.success) return { error: "invalid_input" };
  const a = await authorize("comment", commentId);
  if (!a) return { error: "forbidden" };
  try {
    await replyToComment({ commentId, body: parsed.data.body, userId: a.userId, aiAssisted: parsed.data.ai });
    revalidate(a.project_id);
    return { ok: true };
  } catch (e) {
    console.error(`[inbox] respuesta a comentario falló: ${errorOf(e)}`);
    return { error: errorOf(e) };
  }
}

/**
 * Borrador de respuesta con el agente Community manager. Cobra 1 crédito (atómico) y lo devuelve si falla.
 * Devuelve el texto al editor: nunca se publica solo. En `ai_generations` no se guarda el contenido (solo una etiqueta).
 */
export async function suggestCommentReplyAction(commentId: string, instructions: string): Promise<Result<{ body: string; needsHuman: boolean; note: string }>> {
  const parsedInstr = z.string().max(500).safeParse(instructions ?? "");
  if (!parsedInstr.success) return { error: "invalid_input" };
  const a = await authorize("comment", commentId);
  if (!a) return { error: "forbidden" };
  if (!isAgentsConfigured()) return { error: "not_configured" };
  const admin = createAdminClient();
  if (!admin) return { error: "not_configured" };

  const { data: c } = await a.supabase.from("inbox_comments").select("external_comment_id, parent_external_id, media_id, connection_id").eq("id", commentId).single();
  if (!c) return { error: "not_found" };
  const topId = c.parent_external_id ?? c.external_comment_id;
  if (!/^\d{1,40}$/.test(topId)) return { error: "not_found" }; // se usa en un filtro: solo ids numéricos
  const [{ data: thread }, { data: media }, { data: project }] = await Promise.all([
    a.supabase
      .from("inbox_comments")
      .select("is_own, body_text, commented_at")
      .eq("connection_id", c.connection_id)
      .or(`external_comment_id.eq.${topId},parent_external_id.eq.${topId}`)
      .order("commented_at", { ascending: true })
      .limit(10),
    a.supabase.from("inbox_comment_media").select("caption_snippet").eq("id", c.media_id).single(),
    a.supabase.from("projects").select("name").eq("id", a.project_id).single(),
  ]);
  if (!thread?.length || !project) return { error: "not_found" };

  const { data: genId, error } = await a.supabase.rpc("start_ai_generation", {
    p_project_id: a.project_id,
    p_kind: "text",
    p_provider: "anthropic",
    p_model: "claude-opus-5-5",
    p_prompt: `community.comment_reply ${COMMUNITY_VERSION}`, // sin contenido de comentarios (minimización)
    p_params: { agent: "community.comment_reply", version: COMMUNITY_VERSION, channel: "instagram_comment" },
    p_credits: REPLY_CREDITS,
    p_license: { name: "Anthropic Commercial Terms", commercialUse: true },
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) return { error: error.message.includes("insufficient_credits") ? "insufficient_credits" : "forbidden" };

  try {
    const ctx = await getBrandContext(a.project_id);
    const out = await suggestReply(
      { projectName: project.name, ...ctx },
      {
        channel: "instagram_comment",
        postCaption: media?.caption_snippet ?? null,
        // Sin @usuarios: solo el texto (minimización).
        turns: thread.map((m) => ({ from: m.is_own ? ("brand" as const) : ("customer" as const), text: m.body_text })),
        instructions: parsedInstr.data || undefined,
        locale: await getLocale(),
      },
    );
    await admin.from("ai_generations").update({ status: "succeeded", completed_at: new Date().toISOString() }).eq("id", genId);
    return { ok: true, data: { body: out.reply.slice(0, COMMENT_MAX_LENGTH), needsHuman: out.needsHuman, note: out.note.slice(0, 300) } };
  } catch (e) {
    const code = e instanceof AgentRefusalError ? "refusal" : "provider_error";
    await admin.from("ai_generations").update({ status: "refunded", error_code: code, completed_at: new Date().toISOString() }).eq("id", genId);
    await admin.rpc("grant_credits", { p_workspace_id: a.workspace_id, p_amount: REPLY_CREDITS, p_reason: "refund_ai_failure", p_idempotency_key: `refund:${genId}`, p_ref_type: "ai_generation", p_ref_id: genId });
    return { error: code };
  }
}
