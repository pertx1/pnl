import { getFormatter, getTranslations } from "next-intl/server";
import { Download, Eye, Heart, Send, Users } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { StatCard } from "@/components/kreo/stat-card";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProject } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";
import { requestMetricsIfStale } from "@/lib/analytics/refresh";
import { loadProjectBestTimes, type ProjectBestTimes } from "@/lib/analytics/best-time-data";
import { BestTimesCard } from "@/components/analytics/best-times-card";

export async function generateMetadata() {
  const t = await getTranslations("analytics");
  return { title: t("title") };
}

const DAYS = 30;

/** Fechas límite del periodo actual y anterior (fuera del componente: el lint de React no permite Date.now() al renderizar). */
function periodBounds(days: number) {
  const now = Date.now();
  return {
    since: new Date(now - days * 2 * 86400000).toISOString().slice(0, 10),
    mid: new Date(now - days * 86400000).toISOString().slice(0, 10),
  };
}

function delta(curr: number | null, prev: number | null) {
  if (curr === null || prev === null || prev === 0) return undefined;
  return ((curr - prev) / prev) * 100;
}

export default async function AnalyticsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const t = await getTranslations("analytics");
  const format = await getFormatter();
  const project = await getProject(projectId);
  const supabase = await createClient();

  const { since, mid } = periodBounds(DAYS);
  const [{ data: accounts }, { data: metrics }, { count: publishedCount }] = await Promise.all([
    supabase.from("social_accounts").select("id, platform, handle, display_name, last_synced_at").eq("project_id", projectId),
    supabase
      .from("account_metrics_daily")
      .select("social_account_id, day, followers, views, likes, posts_count, social_accounts!inner(project_id)")
      .eq("social_accounts.project_id", projectId)
      .gte("day", since)
      .order("day"),
    supabase
      .from("post_targets")
      .select("id, posts!inner(project_id)", { count: "exact", head: true })
      .eq("posts.project_id", projectId)
      .eq("status", "published")
      .gte("published_at", mid),
  ]);

  // Cuentas sin estadísticas o con más de 6 h: se piden al momento.
  // Mejores horas: patrón orientativo + historial propio (YouTube solo orientativo). Si falla, la tarjeta queda vacía.
  const [, bestTimes] = await Promise.all([
    requestMetricsIfStale(projectId, accounts ?? []),
    loadProjectBestTimes(supabase, [projectId]).catch(() => new Map() as ProjectBestTimes),
  ]);

  // Sumas por día de las cuentas del proyecto. YouTube queda FUERA de totales y comparativas: sus Developer
  // Policies (III.E.2 y III.E.4.h) prohíben combinar sus datos con otros y crear métricas derivadas.
  // Sus cifras se muestran solo por canal, tal cual las da la API.
  const youtubeIds = new Set((accounts ?? []).filter((a) => a.platform === "youtube").map((a) => a.id));
  const hasYouTube = youtubeIds.size > 0;
  const byDay = new Map<string, { followers: number; views: number; likes: number }>();
  for (const m of metrics ?? []) {
    if (youtubeIds.has(m.social_account_id)) continue;
    const d = byDay.get(m.day) ?? { followers: 0, views: 0, likes: 0 };
    d.followers += m.followers ?? 0;
    d.views += m.views ?? 0;
    d.likes += m.likes ?? 0;
    byDay.set(m.day, d);
  }
  const days = [...byDay.keys()].sort();
  const current = days.filter((d) => d >= mid);
  const previous = days.filter((d) => d < mid);
  const last = (arr: string[], k: "followers" | "views" | "likes") => (arr.length ? byDay.get(arr.at(-1)!)![k] : null);
  const fmtDelta = (v?: number) => (v === undefined ? undefined : `${v >= 0 ? "+" : ""}${format.number(v, { maximumFractionDigits: 1 })} % ${t("vsPrev")}`);
  const followersDelta = delta(last(current, "followers"), last(previous, "followers"));
  const viewsDelta = delta(last(current, "views"), last(previous, "views"));
  const likesDelta = delta(last(current, "likes"), last(previous, "likes"));
  const lastByAccount = new Map<string, { followers: number | null; views: number | null; likes: number | null }>();
  for (const m of metrics ?? []) lastByAccount.set(m.social_account_id, { followers: m.followers, views: m.views, likes: m.likes });

  const n = (v: number | null) => (v === null ? "—" : format.number(v, { notation: "compact", maximumFractionDigits: 1 }));

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-mono">{project.name}</p>
          <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild variant="outline">
          <a href={`/app/analytics-export?project=${projectId}`} download>
            <Download /> {t("exportCsv")}
          </a>
        </Button>
      </div>

      <p className="label-mono">{t("period", { days: DAYS })}</p>
      {hasYouTube && <p className="text-xs text-muted-foreground">{t("youtubeSeparate")}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("followers")} value={n(last(current, "followers"))} delta={fmtDelta(followersDelta)} trend={followersDelta === undefined ? "flat" : followersDelta >= 0 ? "up" : "down"} icon={Users} />
        <StatCard label={t("views")} value={n(last(current, "views"))} delta={fmtDelta(viewsDelta)} trend={viewsDelta === undefined ? "flat" : viewsDelta >= 0 ? "up" : "down"} icon={Eye} />
        <StatCard label={t("likes")} value={n(last(current, "likes"))} delta={fmtDelta(likesDelta)} trend={likesDelta === undefined ? "flat" : likesDelta >= 0 ? "up" : "down"} icon={Heart} />
        <StatCard label={t("published")} value={String(publishedCount ?? 0)} trend="flat" icon={Send} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("followers")}</CardTitle>
        </CardHeader>
        <CardContent>
          {current.length >= 2 ? (
            <AreaChart label={t("followers")} points={current.map((d) => ({ day: d, value: byDay.get(d)!.followers }))} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("noData")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("byAccount")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="label-mono py-2 pr-4 font-normal">{t("account")}</th>
                <th className="label-mono py-2 pr-4 text-right font-normal">{t("followers")}</th>
                <th className="label-mono py-2 pr-4 text-right font-normal">{t("views")}</th>
                <th className="label-mono py-2 pr-4 text-right font-normal">{t("likes")}</th>
                <th className="label-mono py-2 text-right font-normal">{t("lastSync")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(accounts ?? []).map((a) => {
                const m = lastByAccount.get(a.id);
                return (
                  <tr key={a.id}>
                    <td className="py-2 pr-4">
                      <span className="flex items-center gap-2">
                        <PlatformIcon platform={a.platform} className="size-6 text-[9px]" />
                        {a.handle ? `@${a.handle.replace(/^@/, "")}` : a.display_name}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{n(m?.followers ?? null)}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{n(m?.views ?? null)}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{n(m?.likes ?? null)}</td>
                    <td className="py-2 text-right text-xs text-muted-foreground">
                      {a.last_synced_at ? format.relativeTime(new Date(a.last_synced_at)) : t("never")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <BestTimesCard results={bestTimes.get(projectId)} />

      <Card>
        <CardHeader>
          <CardTitle>{t("topPosts")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("topPostsEmpty")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
