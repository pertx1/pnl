import { NonRetriableError } from "inngest";
import { advanceJob, advanceSegment } from "@/lib/clipper/pipeline";
import { InboxError } from "@/lib/inbox/config";
import { RETENTION_DAYS, enrichIgThread, loadConnection, syncConnection } from "@/lib/inbox/sync";
import { freshAccessToken } from "@/lib/inbox/tokens";
import { getFreshTokens, TokenUnavailableError } from "@/lib/social/fresh-tokens";
import { IG_LOGIN_MARK } from "@/lib/social/instagram-login";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "../client";

// Funciones de Inngest de los módulos "inbox" (bandeja) y "clipper". Eventos solo con IDs.

function admin() {
  const a = createAdminClient();
  if (!a) throw new NonRetriableError("SUPABASE_SECRET_KEY no configurada");
  return a;
}

// 1) Cada día: borrado de contenido de mensajes caducado (30 días) y de hilos sin mensajes y sin actividad.
export const inboxRetention = inngest.createFunction(
  { id: "inbox-retention", triggers: [{ cron: "TZ=Europe/Madrid 41 4 * * *" }] },
  async ({ step }) => {
    const messages = await step.run("delete-expired-messages", async () => {
      const { count } = await admin().from("inbox_messages").delete({ count: "exact" }).lt("expires_at", new Date().toISOString());
      return count ?? 0;
    });
    const threads = await step.run("expire-threads", async () => {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
      // Hilos sin actividad en 30 días: se borran (en cascada, sus borradores). El original sigue en Gmail/Outlook/Instagram.
      const { count } = await admin().from("inbox_threads").delete({ count: "exact" }).lt("last_message_at", cutoff);
      return count ?? 0;
    });
    const drafts = await step.run("delete-old-drafts", async () => {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
      const { count } = await admin().from("inbox_drafts").delete({ count: "exact" }).lt("updated_at", cutoff);
      return count ?? 0;
    });
    return { messages, threads, drafts };
  },
);

// 2) Cada 30 min: sincronizar los buzones de email activos. Instagram llega por webhook; las conexiones de Instagram
//    Login se sincronizan también aquí como red de seguridad (Meta solo envía webhooks a apps en modo Live).
export const inboxSyncDispatch = inngest.createFunction(
  { id: "inbox-sync-dispatch", triggers: [{ cron: "*/30 * * * *" }], concurrency: 1 },
  async ({ step }) => {
    const ids = await step.run("list", async () => {
      const [{ data: mail }, { data: ig }] = await Promise.all([
        admin().from("inbox_connections").select("id").in("channel", ["gmail", "outlook"]).eq("status", "active").limit(1000),
        admin().from("inbox_connections").select("id").eq("channel", "instagram").eq("status", "active").eq("metadata->>login", IG_LOGIN_MARK).limit(1000),
      ]);
      return [...(mail ?? []), ...(ig ?? [])].map((c) => c.id);
    });
    if (ids.length) await step.sendEvent("sync", ids.map((connectionId) => ({ name: "inbox/connection.sync", data: { connectionId } })));
    return { dispatched: ids.length };
  },
);

// 3) Sincronizar una conexión: una a la vez por conexión y ritmo limitado (rate limits de Google/Microsoft/Meta).
export const inboxSyncConnection = inngest.createFunction(
  {
    id: "inbox-sync-connection",
    triggers: [{ event: "inbox/connection.sync" }],
    concurrency: { limit: 1, key: "event.data.connectionId" },
    throttle: { limit: 1, period: "5m", key: "event.data.connectionId" },
    retries: 2,
  },
  async ({ event, step }) => {
    const { connectionId } = event.data as { connectionId: string };
    const n = await step.run("sync", async () => {
      try {
        return await syncConnection(connectionId);
      } catch (e) {
        const code = e instanceof InboxError ? e.code : "unknown";
        if (["rate_limited", "unavailable"].includes(code)) throw e; // reintentar con backoff
        throw new NonRetriableError(code);
      }
    });
    return { threads: n };
  },
);

// 4) Completar el @usuario de un hilo nuevo de Instagram.
export const inboxEnrichThread = inngest.createFunction(
  { id: "inbox-enrich-thread", triggers: [{ event: "inbox/thread.enrich" }], throttle: { limit: 10, period: "1m" }, retries: 1 },
  async ({ event, step }) => {
    const { threadId } = event.data as { threadId: string };
    await step.run("enrich", () => enrichIgThread(threadId).catch(() => undefined));
    return { ok: true };
  },
);

// 5) Clipper: cada 2 min avanza los trabajos y renders en curso aunque el usuario haya cerrado la página.
export const clipperSweep = inngest.createFunction(
  { id: "clipper-sweep", triggers: [{ cron: "*/2 * * * *" }], concurrency: 1 },
  async ({ step }) => {
    const pending = await step.run("list", async () => {
      const [{ data: jobs }, { data: segs }] = await Promise.all([
        admin().from("clip_jobs").select("id").in("status", ["transcribing", "analyzing"]).limit(50),
        admin().from("clip_segments").select("id").eq("status", "rendering").limit(100),
      ]);
      return { jobs: (jobs ?? []).map((j) => j.id), segs: (segs ?? []).map((s) => s.id) };
    });
    for (const id of pending.jobs) await step.run(`job-${id}`, () => advanceJob(id).catch(() => "error"));
    for (const id of pending.segs) await step.run(`seg-${id}`, () => advanceSegment(id).catch(() => "error"));
    return { jobs: pending.jobs.length, segments: pending.segs.length };
  },
);

// 6) Cada día: refrescar los tokens de Instagram Login (60 días) de Cuentas y de la Bandeja antes de que caduquen.
//    Solo refresca los que caducan en < 10 días (igRefreshDue). Logs sin tokens: solo códigos.
export const instagramTokenRefresh = inngest.createFunction(
  { id: "instagram-token-refresh", triggers: [{ cron: "TZ=Europe/Madrid 17 5 * * *" }], concurrency: 1 },
  async ({ step }) => {
    const list = await step.run("list", async () => {
      const [{ data: accounts }, { data: conns }] = await Promise.all([
        admin().from("social_accounts").select("id").eq("platform", "instagram").eq("status", "active").eq("metadata->>login", IG_LOGIN_MARK).limit(1000),
        admin().from("inbox_connections").select("id").eq("channel", "instagram").eq("status", "active").eq("metadata->>login", IG_LOGIN_MARK).limit(1000),
      ]);
      return { accounts: (accounts ?? []).map((a) => a.id), conns: (conns ?? []).map((c) => c.id) };
    });
    let failed = 0;
    for (const id of list.accounts) {
      const ok = await step.run(`account-${id}`, async () => {
        try {
          await getFreshTokens(id, "instagram");
          return true;
        } catch (e) {
          console.error(`[instagram-token-refresh] cuenta: ${e instanceof TokenUnavailableError ? e.code : "unknown"}`);
          return false;
        }
      });
      if (!ok) failed++;
    }
    for (const id of list.conns) {
      const ok = await step.run(`inbox-${id}`, async () => {
        const conn = await loadConnection(id);
        if (!conn) return true;
        try {
          await freshAccessToken(conn);
          return true;
        } catch (e) {
          console.error(`[instagram-token-refresh] bandeja: ${e instanceof InboxError ? e.code : "unknown"}`);
          return false;
        }
      });
      if (!ok) failed++;
    }
    return { accounts: list.accounts.length, inbox: list.conns.length, failed };
  },
);

export const inboxFunctions = [inboxRetention, inboxSyncDispatch, inboxSyncConnection, inboxEnrichThread, clipperSweep, instagramTokenRefresh] as const;
