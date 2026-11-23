import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { accountLabel, composeText, failureReason, kindLabel, normalizeLocale, PLATFORM_LABEL, postLabel, tiktokHandoffText, warningsText, type NotifyLocale } from "./text";
import { parseHandoff } from "@/lib/social/tiktok-core";
import type { NotificationType } from "./types";

/**
 * Creación de avisos desde el servidor (worker de Inngest, cierre de generaciones de IA…).
 * REGLA: un fallo al avisar NUNCA rompe el flujo que avisa. Todas las funciones exportadas capturan sus errores
 * y solo registran un código (sin datos personales ni tokens).
 * Privacidad: solo textos cortos del propio usuario (título de su publicación, @ de su cuenta) e IDs.
 *
 * Punto de extensión EMAIL (pendiente de dominio propio): `deliverExternal` recibe cada aviso ya creado.
 * Cuando haya dominio y proveedor UE con DPA, enviar aquí (respetando una preferencia de email aparte, con baja
 * en un clic) usando src/lib/email. Hoy no hace nada.
 */
export type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

type Recipient = { userId: string; locale: NotifyLocale };
type Base = { workspaceId: string; projectId: string | null; type: NotificationType; link: string | null; data?: Record<string, Json>; dedupeKey?: string | null; id?: string };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function deliverExternal(_n: { id: string; userId: string; type: NotificationType; title: string; body: string; link: string | null }) {
  // Intencionadamente vacío: sin dominio propio no se envían emails (ver comentario de arriba).
}

function logFail(where: string, e: unknown) {
  const err = e as { code?: string; message?: string };
  console.error(`[notify] ${where}`, err.code ?? "", (err.message ?? "").slice(0, 60));
}

async function recipients(db: Admin, userIds: (string | null | undefined)[]): Promise<Recipient[]> {
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
  if (!ids.length) return [];
  const { data } = await db.from("profiles").select("id, locale").in("id", ids);
  const loc = new Map((data ?? []).map((p) => [p.id, p.locale]));
  return ids.map((id) => ({ userId: id, locale: normalizeLocale(loc.get(id)) }));
}

async function admins(db: Admin, workspaceId: string) {
  const { data } = await db.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).in("role", ["admin", "owner"]);
  return (data ?? []).map((m) => m.user_id);
}

/** Crea el aviso para cada destinatario en su idioma (la BD comprueba membresía, preferencias y duplicados). */
export async function notifyUsers(db: Admin, userIds: (string | null | undefined)[], base: Base, text: (locale: NotifyLocale) => { title: string; body: string }) {
  let created = 0;
  for (const r of await recipients(db, userIds)) {
    try {
      const { title, body } = text(r.locale);
      const { data: id, error } = await db.rpc("notify_user", {
        p_user_id: r.userId,
        p_workspace_id: base.workspaceId,
        p_project_id: base.projectId,
        p_type: base.type,
        p_title: title,
        p_body: body,
        p_link: base.link,
        p_data: (base.data ?? {}) as Json,
        p_dedupe_key: base.dedupeKey ?? null,
        p_id: base.id ?? null,
      });
      if (error) throw error;
      if (id) {
        created++;
        await deliverExternal({ id, userId: r.userId, type: base.type, title, body, link: base.link });
      }
    } catch (e) {
      logFail(`notify_user ${base.type}`, e);
    }
  }
  return created;
}

/** Publicación publicada o fallida → a quien la creó y a quien la aprobó (o a los admins si no constan). */
export async function notifyPostTarget(db: Admin, postTargetId: string, outcome: "published" | "failed") {
  try {
    const { data: t } = await db.from("post_targets").select("id, post_id, social_account_id, error_code").eq("id", postTargetId).maybeSingle();
    if (!t) return;
    const [{ data: post }, { data: acc }] = await Promise.all([
      db.from("posts").select("id, title, project_id, workspace_id, created_by, approved_by").eq("id", t.post_id).maybeSingle(),
      db.from("social_accounts").select("platform, handle, display_name").eq("id", t.social_account_id).maybeSingle(),
    ]);
    if (!post) return;
    let users: (string | null)[] = [post.created_by, post.approved_by];
    if (!users.some(Boolean)) users = await admins(db, post.workspace_id);
    const platform = PLATFORM_LABEL[acc?.platform ?? ""] ?? "";
    const account = acc ? accountLabel(acc) : "";
    const warnings = outcome === "published" && t.error_code?.startsWith("warn:") ? t.error_code.slice(5).split(",") : [];
    await notifyUsers(
      db,
      users,
      {
        workspaceId: post.workspace_id,
        projectId: post.project_id,
        type: outcome === "published" ? "post_published" : "post_failed",
        link: `/app/p/${post.project_id}/posts/${post.id}`,
        data: { post_id: post.id, post_target_id: t.id, platform: acc?.platform ?? null, ...(outcome === "failed" ? { code: (t.error_code ?? "").slice(0, 60) } : {}) },
        dedupeKey: `post_target:${t.id}:${outcome}`,
      },
      (l) => {
        const params = { platform, account, post: postLabel(post.title, l) };
        if (outcome === "failed") return composeText("post_failed", { ...params, reason: failureReason(t.error_code, l) }, l);
        const w = warningsText(warnings, l);
        return w ? composeText("post_published_warn", { ...params, warnings: w }, l) : composeText("post_published", params, l);
      },
    );
  } catch (e) {
    logFail("post_target", e);
  }
}

/**
 * Destino de TikTok entregado al creador (en sus borradores de TikTok o listo para subir a mano) → a quien creó y
 * aprobó la publicación, con enlace a la página de Kreo con el vídeo, el texto y «Ya lo he publicado».
 */
export async function notifyTikTokHandoff(db: Admin, postTargetId: string) {
  try {
    const { data: t } = await db.from("post_targets").select("id, post_id, social_account_id, error_code").eq("id", postTargetId).maybeSingle();
    const handoff = parseHandoff(t?.error_code);
    if (!t || !handoff) return;
    const [{ data: post }, { data: acc }] = await Promise.all([
      db.from("posts").select("id, title, project_id, workspace_id, created_by, approved_by, ai_generated").eq("id", t.post_id).maybeSingle(),
      db.from("social_accounts").select("platform, handle, display_name").eq("id", t.social_account_id).maybeSingle(),
    ]);
    if (!post) return;
    let users: (string | null)[] = [post.created_by, post.approved_by];
    if (!users.some(Boolean)) users = await admins(db, post.workspace_id);
    await notifyUsers(
      db,
      users,
      {
        workspaceId: post.workspace_id,
        projectId: post.project_id,
        type: "post_action_needed",
        link: `/app/p/${post.project_id}/posts/${post.id}/tiktok`,
        data: { post_id: post.id, post_target_id: t.id, platform: "tiktok", mode: handoff.mode },
        dedupeKey: `post_target:${t.id}:handoff:${handoff.mode}`,
      },
      (l) => tiktokHandoffText(handoff, { platform: PLATFORM_LABEL.tiktok, account: acc ? accountLabel(acc) : "", post: postLabel(post.title, l) }, post.ai_generated, l),
    );
  } catch (e) {
    logFail("tiktok_handoff", e);
  }
}

/** Cuenta social caducada o con error → a quien la conectó y a los admins/owners. Uno al día como mucho. */
export async function notifyAccountIssue(db: Admin, accountId: string) {
  try {
    const { data: a } = await db.from("social_accounts").select("id, workspace_id, project_id, platform, handle, display_name, connected_by, status").eq("id", accountId).maybeSingle();
    if (!a) return;
    await notifyUsers(
      db,
      [a.connected_by, ...(await admins(db, a.workspace_id))],
      {
        workspaceId: a.workspace_id,
        projectId: a.project_id,
        type: "account_issue",
        link: `/app/p/${a.project_id}/accounts`,
        data: { social_account_id: a.id, platform: a.platform, status: a.status },
        dedupeKey: `account_issue:${a.id}:${new Date().toISOString().slice(0, 10)}`,
      },
      (l) => composeText("account_issue", { platform: PLATFORM_LABEL[a.platform] ?? a.platform, account: accountLabel(a) }, l),
    );
  } catch (e) {
    logFail("account_issue", e);
  }
}

/** Conexión de la bandeja (Gmail/Outlook/Instagram DMs) caducada. No incluye la dirección de email en el texto. */
export async function notifyInboxIssue(db: Admin, connectionId: string) {
  try {
    const { data: c } = await db.from("inbox_connections").select("id, workspace_id, project_id, channel, connected_by").eq("id", connectionId).maybeSingle();
    if (!c) return;
    await notifyUsers(
      db,
      [c.connected_by, ...(await admins(db, c.workspace_id))],
      {
        workspaceId: c.workspace_id,
        projectId: c.project_id,
        type: "account_issue",
        link: `/app/p/${c.project_id}/inbox`,
        data: { inbox_connection_id: c.id, channel: c.channel },
        dedupeKey: `inbox_issue:${c.id}:${new Date().toISOString().slice(0, 10)}`,
      },
      (l) => composeText("inbox_issue", { channel: PLATFORM_LABEL[c.channel] ?? c.channel }, l),
    );
  } catch (e) {
    logFail("inbox_issue", e);
  }
}

/** Generación de IA terminada o fallida (con créditos devueltos) → a quien la lanzó. */
export async function notifyGeneration(db: Admin, generationId: string, outcome: "done" | "failed") {
  try {
    const { data: g } = await db.from("ai_generations").select("id, workspace_id, project_id, kind, created_by, credits_cost").eq("id", generationId).maybeSingle();
    if (!g?.created_by) return;
    await notifyUsers(
      db,
      [g.created_by],
      {
        workspaceId: g.workspace_id,
        projectId: g.project_id,
        type: outcome === "done" ? "ai_done" : "ai_failed",
        link: `/app/p/${g.project_id}/studio`,
        data: { generation_id: g.id, kind: g.kind },
        dedupeKey: `ai:${g.id}:${outcome}`,
      },
      (l) => composeText(outcome === "done" ? "ai_done" : "ai_failed", { kind: kindLabel(g.kind, l), credits: g.credits_cost }, l),
    );
  } catch (e) {
    logFail("generation", e);
  }
}
