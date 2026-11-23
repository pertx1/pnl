// TikTok · seguimiento de los vídeos enviados a los borradores del creador (se registra en ../functions.ts).
import { notifyTikTokHandoff } from "@/lib/notifications/notify";
import { settledPostStatus } from "@/lib/posts/settle";
import { getFreshTokens } from "@/lib/social/fresh-tokens";
import { fetchTikTokPublishStatus } from "@/lib/social/tiktok-api";
import { AWAITING_USER_PUBLISH, handoffCode, inboxOutcome, parseHandoff } from "@/lib/social/tiktok-core";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "../client";

const WINDOW_DAYS = 7;

/**
 * Cada 15 min: consulta `status/fetch` (API oficial, 30 peticiones/min por token) de los envíos a borradores.
 * - PUBLISH_COMPLETE (el creador lo publicó desde la notificación de TikTok) → destino publicado.
 * - FAILED → «listo para subir a mano» y aviso.
 * Solo los de los últimos 7 días; pasado ese plazo queda el botón «Ya lo he publicado» de Kreo.
 * Kreo no publica nada aquí: solo lee el estado de lo que la persona ya hizo en TikTok.
 */
export const syncTikTokInbox = inngest.createFunction(
  { id: "tiktok-inbox-sync", triggers: [{ cron: "*/15 * * * *" }], concurrency: 1 },
  async ({ step }) => {
    const targets = await step.run("list", async () => {
      const db = createAdminClient();
      if (!db) return [];
      const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
      const { data } = await db
        .from("post_targets")
        .select("id, post_id, social_account_id, external_post_id, error_code, updated_at")
        .eq("status", AWAITING_USER_PUBLISH)
        .eq("error_code", "info:tiktok_inbox")
        .not("external_post_id", "is", null)
        .gte("updated_at", since)
        .limit(100);
      // Solo IDs (lo que devuelve un paso se guarda en Inngest).
      return (data ?? []).map((t) => ({ id: t.id, postId: t.post_id, accountId: t.social_account_id }));
    });
    let published = 0;
    let failed = 0;
    for (const t of targets) {
      const r = await step.run(`check-${t.id}`, async () => {
        const db = createAdminClient();
        if (!db) return "skip";
        try {
          const { data: row } = await db.from("post_targets").select("status, external_post_id, error_code").eq("id", t.id).maybeSingle();
          if (!row || row.status !== AWAITING_USER_PUBLISH || parseHandoff(row.error_code)?.mode !== "inbox" || !row.external_post_id) return "skip";
          const tokens = await getFreshTokens(t.accountId, "tiktok");
          const s = await fetchTikTokPublishStatus(tokens, row.external_post_id);
          const outcome = inboxOutcome(s.status);
          if (outcome === "published") {
            await db
              .from("post_targets")
              .update({ status: "published", published_at: new Date().toISOString(), error_code: null, ...(s.postId ? { external_post_id: s.postId } : {}) })
              .eq("id", t.id)
              .eq("status", AWAITING_USER_PUBLISH);
          } else if (outcome === "failed") {
            await db
              .from("post_targets")
              .update({ external_post_id: null, error_code: handoffCode({ mode: "manual", reason: "inbox_failed" }) })
              .eq("id", t.id)
              .eq("status", AWAITING_USER_PUBLISH);
            await notifyTikTokHandoff(db, t.id);
          } else return "waiting";
          const { data: all } = await db.from("post_targets").select("status").eq("post_id", t.postId);
          const status = settledPostStatus((all ?? []).map((x) => x.status));
          if (status) await db.from("posts").update({ status }).eq("id", t.postId);
          return outcome;
        } catch (e) {
          // Una cuenta caducada o un error de TikTok no bloquea a las demás. Solo el tipo de error.
          const err = e as { code?: string; message?: string };
          console.error("[tiktok-inbox] fallo al consultar el estado", err.code ?? "", (err.message ?? "").slice(0, 60));
          return "error";
        }
      });
      if (r === "published") published++;
      if (r === "failed") failed++;
    }
    return { checked: targets.length, published, failed };
  },
);

export const tiktokFunctions = [syncTikTokInbox];
