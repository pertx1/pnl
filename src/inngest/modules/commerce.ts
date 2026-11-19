// Funciones de Inngest del módulo "commerce" (se registran en ../functions.ts). Eventos solo con IDs.
import { NonRetriableError } from "inngest";
import { nextRunAt, type Frequency } from "@/lib/reports/core";
import { sendScheduledReport } from "@/lib/reports/email";
import { syncOrders } from "@/lib/shopify/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "../client";

function admin() {
  const a = createAdminClient();
  if (!a) throw new NonRetriableError("SUPABASE_SECRET_KEY no configurada");
  return a;
}

// 1) Sincronizar pedidos de una tienda (tras vincularla o a petición). Una a la vez por tienda y ritmo limitado.
export const shopifySyncStore = inngest.createFunction(
  {
    id: "shopify-sync-store",
    triggers: [{ event: "shopify/store.sync" }],
    concurrency: { limit: 1, key: "event.data.storeId" },
    throttle: { limit: 2, period: "1m", key: "event.data.storeId" },
    retries: 2,
  },
  async ({ event, step }) => {
    const { storeId } = event.data as { storeId: string };
    return step.run("sync", () => syncOrders(storeId, 60));
  },
);

// 2) Cada 6 h: sincronizar todas las tiendas activas (red de seguridad si se pierde algún webhook; mantiene vivo el refresh token).
export const shopifySyncAll = inngest.createFunction(
  { id: "shopify-sync-all", triggers: [{ cron: "TZ=Europe/Madrid 37 */6 * * *" }], concurrency: 1 },
  async ({ step }) => {
    const stores = await step.run("list", async () => {
      const { data } = await admin().from("shopify_stores").select("id").eq("status", "active").limit(1000);
      return (data ?? []).map((s) => s.id);
    });
    if (stores.length) {
      await step.sendEvent(
        "sync",
        stores.map((id) => ({ name: "shopify/store.sync", data: { storeId: id } })),
      );
    }
    return { stores: stores.length };
  },
);

// 3) Cada hora: informes programados que toca enviar → un evento por programación.
export const reportsDispatch = inngest.createFunction(
  { id: "reports-dispatch", triggers: [{ cron: "TZ=Europe/Madrid 13 * * * *" }], concurrency: 1 },
  async ({ step }) => {
    const due = await step.run("find-due", async () => {
      const { data } = await admin().from("report_schedules").select("id, next_run_at").eq("active", true).lte("next_run_at", new Date().toISOString()).limit(500);
      return data ?? [];
    });
    if (due.length) {
      // id del evento = programación + fecha → Inngest descarta duplicados (no se envía dos veces).
      await step.sendEvent(
        "send",
        due.map((d) => ({ id: `report-${d.id}-${d.next_run_at}`, name: "report/schedule.send", data: { scheduleId: d.id } })),
      );
    }
    return { dispatched: due.length };
  },
);

// 4) Enviar un informe programado (o "enviar ahora"). Reclama la ejecución de forma atómica antes de enviar.
export const reportSend = inngest.createFunction(
  {
    id: "report-send",
    triggers: [{ event: "report/schedule.send" }],
    concurrency: { limit: 1, key: "event.data.scheduleId" },
    retries: 1,
  },
  async ({ event, step }) => {
    const { scheduleId, manual } = event.data as { scheduleId: string; manual?: boolean };
    const claimed = await step.run("claim", async () => {
      const db = admin();
      const { data: s } = await db.from("report_schedules").select("id, frequency, next_run_at, active").eq("id", scheduleId).maybeSingle();
      if (!s || !s.active) return false;
      if (manual) return true;
      const now = new Date();
      if (new Date(s.next_run_at).getTime() > now.getTime()) return false;
      const { data } = await db
        .from("report_schedules")
        .update({ next_run_at: nextRunAt(s.frequency as Frequency, now).toISOString() })
        .eq("id", scheduleId)
        .eq("next_run_at", s.next_run_at)
        .select("id");
      return !!data?.length;
    });
    if (!claimed) return { skipped: true };
    return step.run("send", () => sendScheduledReport(scheduleId));
  },
);

export const commerceFunctions = [shopifySyncStore, shopifySyncAll, reportsDispatch, reportSend] as const;
