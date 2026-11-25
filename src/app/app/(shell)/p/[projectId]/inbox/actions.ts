"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AgentRefusalError, isAgentsConfigured } from "@/lib/agents";
import { COMMUNITY_VERSION, suggestReply } from "@/lib/agents/community";
import { getBrandContext } from "@/lib/ai/brand-context";
import { inngest } from "@/inngest/client";
import { channelConfigured, InboxError } from "@/lib/inbox/config";
import { activateIgLoginInbox } from "@/lib/inbox/instagram-activate";
import { getFreshTokens, TokenUnavailableError } from "@/lib/social/fresh-tokens";
import { IG_SCOPE_MESSAGES, instagramLoginEnabled, isInstagramLogin } from "@/lib/social/instagram-login";
import { disconnectConnection } from "@/lib/inbox/connections";
import { markReadInProvider } from "@/lib/inbox/provider-read";
import { includesComments, isReadScope, threadChannelsFor, type ReadScope } from "@/lib/inbox/read-state";
import { sendReply } from "@/lib/inbox/send";
import { syncConnection } from "@/lib/inbox/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result<T = undefined> = { ok: true; data?: T } | { ok?: false; error: string };

const REPLY_CREDITS = 1;
const uuid = z.uuid();

/** Comprueba con la SESIÓN del usuario (RLS + rol) que puede actuar sobre el hilo/conexión. */
async function authorize(kind: "thread" | "connection", id: string, minRole: "editor" | "admin") {
  if (!uuid.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: row } =
    kind === "thread"
      ? await supabase.from("inbox_threads").select("id, workspace_id, project_id").eq("id", id).maybeSingle()
      : await supabase.from("inbox_connections").select("id, workspace_id, project_id").eq("id", id).maybeSingle();
  if (!row) return null;
  const { data: ok } = await supabase.rpc("has_workspace_role", { p_workspace_id: row.workspace_id, p_min_role: minRole });
  if (!ok) return null;
  return { ...row, userId: auth.user.id, supabase };
}

const errorOf = (e: unknown) => (e instanceof InboxError ? e.code : "generic");
const revalidate = (projectId: string) => revalidatePath(`/app/p/${projectId}/inbox`);

export async function syncNow(connectionId: string): Promise<Result<number>> {
  const a = await authorize("connection", connectionId, "editor");
  if (!a) return { error: "forbidden" };
  try {
    const n = await syncConnection(connectionId);
    revalidate(a.project_id);
    return { ok: true, data: n };
  } catch (e) {
    return { error: errorOf(e) };
  }
}

export async function disconnect(connectionId: string): Promise<Result> {
  const a = await authorize("connection", connectionId, "admin");
  if (!a) return { error: "forbidden" };
  try {
    await disconnectConnection(connectionId);
    revalidate(a.project_id);
    return { ok: true };
  } catch (e) {
    return { error: errorOf(e) };
  }
}

/**
 * «Activar mensajes» de una cuenta de Instagram conectada en Cuentas.
 * - Instagram Login y la cuenta ya concedió `instagram_business_manage_messages`: REUTILIZA su token (sin otro login),
 *   suscribe la cuenta al webhook de mensajes y lanza la primera sincronización.
 * - Si no (falta el permiso, token caducado o cuenta de Facebook Login): devuelve `redirect` al OAuth oficial.
 * Acción de servidor (POST con comprobación de origen): no se puede disparar desde otra web con un enlace.
 */
export async function activateInstagramInbox(projectId: string, accountId: string): Promise<Result<{ redirect?: string }>> {
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(accountId).success) return { error: "invalid_input" };
  if (!channelConfigured("instagram")) return { error: "not_configured" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "forbidden" };
  const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", projectId).maybeSingle();
  if (!project) return { error: "forbidden" };
  const { data: ok } = await supabase.rpc("has_workspace_role", { p_workspace_id: project.workspace_id, p_min_role: "editor" });
  if (!ok) return { error: "forbidden" };
  const { data: acc } = await supabase
    .from("social_accounts")
    .select("id, external_id, handle, status, granted_scopes, metadata")
    .eq("id", accountId)
    .eq("project_id", projectId)
    .eq("platform", "instagram")
    .maybeSingle();
  if (!acc) return { error: "no_matching_account" };

  const oauth = { ok: true as const, data: { redirect: `/api/inbox/oauth/instagram/start?project=${projectId}&account=${accountId}` } };
  const reusable = instagramLoginEnabled() && isInstagramLogin(acc.metadata) && acc.status === "active" && acc.granted_scopes.includes(IG_SCOPE_MESSAGES);
  if (!reusable) return oauth;

  try {
    const tokens = await getFreshTokens(acc.id, "instagram");
    const connectionId = await activateIgLoginInbox({
      workspaceId: project.workspace_id,
      projectId,
      userId: auth.user.id,
      account: { id: acc.id, external_id: acc.external_id, handle: acc.handle },
      token: tokens,
      grantedScopes: acc.granted_scopes,
    });
    await inngest.send({ name: "inbox/connection.sync", data: { connectionId } }).catch(() => undefined);
    revalidate(projectId);
    return { ok: true, data: {} };
  } catch (e) {
    // Token caducado o retirado → login de Instagram para volver a concederlo.
    if (e instanceof TokenUnavailableError || (e instanceof InboxError && e.code === "token_expired")) return oauth;
    console.error(`[inbox] activar instagram falló: ${errorOf(e)}`);
    return { error: errorOf(e) };
  }
}

export async function setThreadStatus(threadId: string, status: "open" | "archived"): Promise<Result> {
  if (!["open", "archived"].includes(status)) return { error: "invalid_input" };
  const a = await authorize("thread", threadId, "editor");
  if (!a) return { error: "forbidden" };
  const { error } = await a.supabase.from("inbox_threads").update({ status }).eq("id", threadId);
  if (error) return { error: "forbidden" };
  revalidate(a.project_id);
  return { ok: true };
}

/**
 * Marca un hilo como leído o no leído. En Kreo siempre; en Gmail/Outlook solo si la conexión ya tiene permiso de
 * modificar el buzón (hoy no se pide: ver src/lib/inbox/read-state.ts). Instagram no se toca.
 */
export async function markRead(threadId: string, unread = false): Promise<Result> {
  if (typeof unread !== "boolean") return { error: "invalid_input" };
  const a = await authorize("thread", threadId, "editor");
  if (!a) return { error: "forbidden" };
  const { error } = await a.supabase.from("inbox_threads").update({ unread }).eq("id", threadId);
  if (error) return { error: "forbidden" };
  if (!unread) await markReadInProvider([threadId]);
  revalidate(a.project_id);
  return { ok: true };
}

/**
 * «Marcar todo como leído» del proyecto: todo, o un canal (DMs de Instagram, comentarios, Gmail u Outlook).
 * Con la sesión del usuario (RLS: rol editor; los triggers solo dejan cambiar `unread`). Devuelve cuántos se marcaron.
 */
export async function markAllRead(projectId: string, scope: ReadScope): Promise<Result<number>> {
  if (!uuid.safeParse(projectId).success || !isReadScope(scope)) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "forbidden" };
  const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", projectId).maybeSingle();
  if (!project) return { error: "forbidden" };
  const { data: ok } = await supabase.rpc("has_workspace_role", { p_workspace_id: project.workspace_id, p_min_role: "editor" });
  if (!ok) return { error: "forbidden" };

  let total = 0;
  const channels = threadChannelsFor(scope);
  if (channels.length) {
    const { data: conns } = await supabase.from("inbox_connections").select("id").eq("project_id", projectId).in("channel", channels);
    const ids = (conns ?? []).map((c) => c.id);
    if (ids.length) {
      const { data: rows, error } = await supabase.from("inbox_threads").update({ unread: false }).eq("project_id", projectId).eq("unread", true).in("connection_id", ids).select("id");
      if (error) return { error: "forbidden" };
      total += rows?.length ?? 0;
      if (rows?.length) await markReadInProvider(rows.map((r) => r.id));
    }
  }
  if (includesComments(scope)) {
    const { data: rows, error } = await supabase.from("inbox_comments").update({ unread: false }).eq("project_id", projectId).eq("unread", true).select("id");
    if (error) return { error: "forbidden" };
    total += rows?.length ?? 0;
  }
  revalidate(projectId);
  return { ok: true, data: total };
}

export async function saveDraft(threadId: string, body: string): Promise<Result> {
  const parsed = z.string().max(10000).safeParse(body);
  if (!parsed.success) return { error: "invalid_input" };
  const a = await authorize("thread", threadId, "editor");
  if (!a) return { error: "forbidden" };
  const { data: existing } = await a.supabase.from("inbox_drafts").select("thread_id").eq("thread_id", threadId).maybeSingle();
  const { error } = existing
    ? await a.supabase.from("inbox_drafts").update({ body: parsed.data, updated_by: a.userId, updated_at: new Date().toISOString() }).eq("thread_id", threadId)
    : await a.supabase.from("inbox_drafts").insert({ thread_id: threadId, workspace_id: a.workspace_id, body: parsed.data, updated_by: a.userId });
  return error ? { error: "forbidden" } : { ok: true };
}

/**
 * Sugerencia de respuesta con el agente Community manager. Cobra 1 crédito (atómico) y lo devuelve si falla.
 * El resultado queda como BORRADOR editable: nunca se envía solo.
 * En `ai_generations` NO se guarda el contenido de la conversación (solo una etiqueta).
 */
export async function suggestReplyAction(threadId: string, instructions: string): Promise<Result<{ body: string; needsHuman: boolean; note: string }>> {
  const parsedInstr = z.string().max(500).safeParse(instructions ?? "");
  if (!parsedInstr.success) return { error: "invalid_input" };
  const a = await authorize("thread", threadId, "editor");
  if (!a) return { error: "forbidden" };
  if (!isAgentsConfigured()) return { error: "not_configured" };
  const admin = createAdminClient();
  if (!admin) return { error: "not_configured" };

  const [{ data: thread }, { data: msgs }, { data: project }] = await Promise.all([
    a.supabase.from("inbox_threads").select("subject, inbox_connections!inner(channel)").eq("id", threadId).single(),
    a.supabase.from("inbox_messages").select("direction, body_text").eq("thread_id", threadId).order("sent_at", { ascending: false }).limit(10),
    a.supabase.from("projects").select("name").eq("id", a.project_id).single(),
  ]);
  if (!thread || !msgs?.length || !project) return { error: "not_found" };
  const channel = thread.inbox_connections.channel;

  const { data: genId, error } = await a.supabase.rpc("start_ai_generation", {
    p_project_id: a.project_id,
    p_kind: "text",
    p_provider: "anthropic",
    p_model: "claude-opus-5-5",
    p_prompt: `community.reply ${COMMUNITY_VERSION}`, // sin contenido de mensajes (minimización)
    p_params: { agent: "community.reply", version: COMMUNITY_VERSION, channel },
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
        channel,
        subject: thread.subject,
        turns: [...msgs].reverse().map((m) => ({ from: m.direction === "in" ? ("customer" as const) : ("brand" as const), text: m.body_text })),
        instructions: parsedInstr.data || undefined,
        locale: await getLocale(),
      },
    );
    const body = channel === "instagram" ? out.reply.slice(0, 900) : out.reply.slice(0, 10000);
    await admin.from("inbox_drafts").upsert({ thread_id: threadId, workspace_id: a.workspace_id, body, ai_generated: true, prompt_version: COMMUNITY_VERSION, updated_by: a.userId, updated_at: new Date().toISOString() });
    await admin.from("ai_generations").update({ status: "succeeded", completed_at: new Date().toISOString() }).eq("id", genId);
    return { ok: true, data: { body, needsHuman: out.needsHuman, note: out.note.slice(0, 300) } };
  } catch (e) {
    const code = e instanceof AgentRefusalError ? "refusal" : "provider_error";
    await admin.from("ai_generations").update({ status: "refunded", error_code: code, completed_at: new Date().toISOString() }).eq("id", genId);
    await admin.rpc("grant_credits", { p_workspace_id: a.workspace_id, p_amount: REPLY_CREDITS, p_reason: "refund_ai_failure", p_idempotency_key: `refund:${genId}`, p_ref_type: "ai_generation", p_ref_id: genId });
    return { error: code };
  }
}

/** Envía la respuesta. SOLO se llama desde el botón "Enviar" (acción humana explícita). */
export async function sendReplyAction(threadId: string, body: string, aiAssisted: boolean): Promise<Result> {
  const parsed = z.object({ body: z.string().trim().min(1).max(10000), ai: z.boolean() }).safeParse({ body, ai: aiAssisted });
  if (!parsed.success) return { error: "invalid_input" };
  const a = await authorize("thread", threadId, "editor");
  if (!a) return { error: "forbidden" };
  try {
    await sendReply({ threadId, body: parsed.data.body, userId: a.userId, aiAssisted: parsed.data.ai });
    revalidate(a.project_id);
    return { ok: true };
  } catch (e) {
    console.error(`[inbox] envío falló: ${errorOf(e)}`);
    return { error: errorOf(e) };
  }
}
