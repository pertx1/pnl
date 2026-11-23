import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, computeFreeSlots, daysBetween, DEFAULT_TZ, PLANNED_STATUSES, zonedParts, zonedToUtc } from "@/lib/mcp/calendar";
import { defaultFrequency } from "@/lib/strategy/templates";
import type { Database } from "@/lib/supabase/database.types";
import { planClipSchedule } from "./schedule";

type Db = SupabaseClient<Database>;

export const SCHEDULE_HORIZON_DAYS = 21;

/**
 * Huecos libres de las cuentas elegidas (mismo cálculo que la herramienta get_free_slots del conector MCP:
 * computeFreeSlots con el límite diario de cada cuenta y la hora preferida de la estrategia o de la red) y reparto de clips.
 * Empieza mañana (hora local) para dejar tiempo a revisar y aprobar.
 */
export async function planForAccounts(db: Db, o: { projectId: string; accountIds: string[]; clipIds: string[]; perDay: number; tz?: string }) {
  const tz = o.tz ?? DEFAULT_TZ;
  const now = new Date();
  const from = addDays(zonedParts(now, tz).day, 1);
  const to = addDays(from, SCHEDULE_HORIZON_DAYS - 1);
  const startUtc = zonedToUtc(from, 0, tz).toISOString();
  const endUtc = zonedToUtc(addDays(to, 1), 0, tz).toISOString();

  const [{ data: accounts }, { data: strategies }, { data: posts }] = await Promise.all([
    db.from("social_accounts").select("id, project_id, platform, handle, status, daily_post_limit").eq("project_id", o.projectId).in("id", o.accountIds).eq("status", "active"),
    db.from("strategies").select("project_id, social_account_id, frequency").eq("project_id", o.projectId),
    db
      .from("posts")
      .select("scheduled_at, status, post_targets(social_account_id)")
      .eq("project_id", o.projectId)
      .in("status", ["draft", ...PLANNED_STATUSES])
      // ±1 día: el límite se comprueba al aprobar por día UTC.
      .gte("scheduled_at", new Date(new Date(startUtc).getTime() - 86_400_000).toISOString())
      .lt("scheduled_at", new Date(new Date(endUtc).getTime() + 86_400_000).toISOString())
      .limit(2000),
  ]);
  const found = accounts ?? [];
  if (found.length !== o.accountIds.length) return { error: "invalid_accounts" as const };

  const prefHour = (accountId: string, platform: string) => {
    const pick = (rows: typeof strategies) =>
      (rows ?? [])
        .flatMap((s) => (Array.isArray(s.frequency) ? (s.frequency as { platform?: string; hour?: number }[]) : []))
        .find((f) => f.platform === platform && typeof f.hour === "number")?.hour;
    return (
      pick((strategies ?? []).filter((s) => s.social_account_id === accountId)) ??
      pick((strategies ?? []).filter((s) => !s.social_account_id)) ??
      (["tiktok", "instagram", "youtube"].includes(platform) ? defaultFrequency(platform as "tiktok").hour : 13)
    );
  };

  const days = computeFreeSlots({
    days: daysBetween(from, to),
    tz,
    now,
    accounts: found.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle, dailyLimit: a.daily_post_limit, preferredHour: prefHour(a.id, a.platform) })),
    posts: (posts ?? []).filter((p) => p.scheduled_at).map((p) => ({ scheduledAt: p.scheduled_at!, status: p.status, accountIds: (p.post_targets ?? []).map((t) => t.social_account_id) })),
  });
  const plan = planClipSchedule({ clipIds: o.clipIds, days, accountIds: o.accountIds, perDay: o.perDay, tz });
  return { ...plan, accounts: found, tz };
}
