import "server-only";
import { inngest } from "@/inngest/client";

const STALE_MS = 6 * 3600_000;

/**
 * Si alguna cuenta del proyecto no tiene estadísticas (o son de hace más de 6 h), pide descargarlas al momento.
 * El id del evento agrupa por proyecto y cuarto de hora: recargar la página no lanza más descargas (Inngest deduplica).
 * Devuelve true si se ha pedido una actualización.
 */
export async function requestMetricsIfStale(projectId: string, accounts: { last_synced_at: string | null }[]) {
  const now = Date.now();
  const stale = accounts.some((a) => !a.last_synced_at || now - new Date(a.last_synced_at).getTime() > STALE_MS);
  if (!stale) return false;
  await inngest
    .send({ id: `metrics-${projectId}-${Math.floor(now / 900_000)}`, name: "social/metrics.refresh", data: { projectId } })
    .catch(() => undefined);
  return true;
}
