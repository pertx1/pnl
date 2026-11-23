import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

const DAY = 86_400_000;
/** Autorizaciones revocadas: se conservan 30 días (auditoría y soporte) y después se borran con sus tokens (cascada). */
export const REVOKED_GRANT_RETENTION_DAYS = 30;

/**
 * Plazos de conservación del servidor OAuth del MCP (minimización RGPD). La limpieza perezosa de las funciones SQL solo
 * borra filas del mismo sujeto/autorización; esta tarea diaria (data-retention) borra el resto:
 *  - límites por IP/usuario: ventanas de minuto > 10 min y de día > 2 días (lo que promete la documentación);
 *  - códigos de autorización caducados hace > 1 día;
 *  - tokens caducados hace > 1 día;
 *  - autorizaciones revocadas hace > 30 días, y las abandonadas (sin ningún token vigente) hace > 1 día.
 */
export async function purgeMcpOAuth(db: Admin, now = Date.now()) {
  const iso = (ms: number) => new Date(ms).toISOString();
  const out = { rateLimits: 0, codes: 0, tokens: 0, grants: 0 };

  const rl1 = await db.from("mcp_oauth_rate_limits").delete({ count: "exact" }).eq("bucket", "minute").lt("window_start", iso(now - 10 * 60_000));
  const rl2 = await db.from("mcp_oauth_rate_limits").delete({ count: "exact" }).eq("bucket", "day").lt("window_start", iso(now - 2 * DAY));
  out.rateLimits = (rl1.count ?? 0) + (rl2.count ?? 0);

  const codes = await db.from("mcp_oauth_codes").delete({ count: "exact" }).lt("expires_at", iso(now - DAY));
  out.codes = codes.count ?? 0;

  const tokens = await db.from("mcp_oauth_tokens").delete({ count: "exact" }).lt("expires_at", iso(now - DAY));
  out.tokens = tokens.count ?? 0;

  const revoked = await db.from("mcp_oauth_grants").delete({ count: "exact" }).lt("revoked_at", iso(now - REVOKED_GRANT_RETENTION_DAYS * DAY));
  out.grants = revoked.count ?? 0;

  // Autorizaciones sin revocar pero muertas: todos sus tokens ya caducaron y se borraron arriba.
  const { data: candidates } = await db.from("mcp_oauth_grants").select("id").is("revoked_at", null).lt("created_at", iso(now - DAY)).order("last_used_at", { ascending: true, nullsFirst: true }).limit(200); // lotes pequeños (la lista va en la URL), las menos usadas primero
  const ids = (candidates ?? []).map((g) => g.id);
  if (ids.length) {
    const { data: alive } = await db.from("mcp_oauth_tokens").select("grant_id").in("grant_id", ids);
    const aliveSet = new Set((alive ?? []).map((t) => t.grant_id));
    const dead = ids.filter((id) => !aliveSet.has(id));
    if (dead.length) {
      const del = await db.from("mcp_oauth_grants").delete({ count: "exact" }).in("id", dead);
      out.grants += del.count ?? 0;
    }
  }
  return out;
}
