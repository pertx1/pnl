// Funciones de Inngest del centro de avisos (se registran en ../functions.ts).
import { notifyUsers } from "@/lib/notifications/notify";
import { accountLabel, composeText } from "@/lib/notifications/text";
import { sendWeeklySummary } from "@/lib/notifications/weekly";
import { consentDedupeKey, googleOAuthInTesting, lastConsentAt, youtubeConsentStatus } from "@/lib/notifications/youtube-consent";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "../client";

/**
 * Resumen semanal: lunes a las 8:00 (Madrid). Un paso por proyecto: si uno falla, los demás siguen
 * (y la clave de deduplicación evita repetir avisos si Inngest reintenta).
 */
export const weeklySummary = inngest.createFunction(
  { id: "notifications-weekly-summary", triggers: [{ cron: "TZ=Europe/Madrid 0 8 * * 1" }], concurrency: 1 },
  async ({ step }) => {
    const projects = await step.run("list-projects", async () => {
      const db = createAdminClient();
      if (!db) return [];
      const { data } = await db.from("projects").select("id, name, workspace_id").is("archived_at", null).order("created_at").limit(2000);
      return data ?? [];
    });
    let sent = 0;
    for (const p of projects) {
      const r = await step.run(`summary-${p.id}`, async () => {
        const db = createAdminClient();
        if (!db) return { sent: 0 };
        try {
          return await sendWeeklySummary(db, p);
        } catch (e) {
          console.error("[weekly] fallo al armar el resumen", (e as Error).message?.slice(0, 60));
          return { sent: 0 };
        }
      });
      sent += r.sent;
    }
    return { projects: projects.length, sent };
  },
);

/**
 * Varias veces al día (9, 13, 17 y 21 h): permisos de YouTube que caducan en ≤ 2 días mientras Google tenga la app
 * «En prueba» (refresh token de 7 días). Aviso a quien conectó la cuenta y a los admins/owners; uno por consentimiento.
 */
export const youtubeConsentCheck = inngest.createFunction(
  { id: "notifications-youtube-consent", triggers: [{ cron: "TZ=Europe/Madrid 0 9,13,17,21 * * *" }], concurrency: 1 },
  async ({ step }) => {
    if (!googleOAuthInTesting()) return { skipped: "google_in_production" };
    return step.run("check", async () => {
      const db = createAdminClient();
      if (!db) return { skipped: "no_admin_client" };
      const { data: accounts } = await db
        .from("social_accounts")
        .select("id, workspace_id, project_id, platform, handle, display_name, connected_by, created_at")
        .eq("platform", "youtube")
        .eq("status", "active")
        .limit(1000);
      if (!accounts?.length) return { checked: 0, notified: 0 };
      const ids = accounts.map((a) => a.id);
      const [{ data: activity }, { data: tokens }] = await Promise.all([
        db
          .from("activity_log")
          .select("entity_id, action, created_at")
          .eq("entity_type", "social_account")
          .in("entity_id", ids)
          .in("action", ["social_account.connected", "social_account.reconnected"])
          .order("created_at", { ascending: false })
          .limit(5000),
        db.from("social_account_tokens").select("social_account_id, refresh_expires_at").in("social_account_id", ids),
      ]);
      const now = new Date();
      let notified = 0;
      for (const a of accounts) {
        const consentAt = lastConsentAt(a.created_at, (activity ?? []).filter((x) => x.entity_id === a.id));
        const refreshExp = tokens?.find((t) => t.social_account_id === a.id)?.refresh_expires_at;
        const st = youtubeConsentStatus(consentAt, now, refreshExp ? new Date(refreshExp) : null);
        if (st.state !== "expiring") continue; // si ya caducó, lo avisará el paso de publicación/estadísticas al fallar
        const { data: admins } = await db.from("workspace_members").select("user_id").eq("workspace_id", a.workspace_id).in("role", ["admin", "owner"]);
        notified += await notifyUsers(
          db,
          [a.connected_by, ...(admins ?? []).map((m) => m.user_id)],
          {
            workspaceId: a.workspace_id,
            projectId: a.project_id,
            type: "youtube_consent_expiring",
            link: `/app/p/${a.project_id}/accounts`,
            data: { social_account_id: a.id, expires_at: st.expiresAt.toISOString() },
            dedupeKey: consentDedupeKey(a.id, consentAt),
          },
          (l) =>
            composeText(
              "youtube_consent_expiring",
              {
                account: accountLabel(a),
                date: new Intl.DateTimeFormat(l === "en" ? "en-GB" : "es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(st.expiresAt),
              },
              l,
            ),
        );
      }
      return { checked: accounts.length, notified };
    });
  },
);

export const notificationFunctions = [weeklySummary, youtubeConsentCheck] as const;
