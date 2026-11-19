import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { AlertTriangle, ArrowLeft, CalendarDays, ExternalLink, Eye, FileVideo, Flame, Heart, MessageCircle, Users } from "lucide-react";
import { StatCard } from "@/components/kreo/stat-card";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isAgentsConfigured } from "@/lib/agents";
import type { CompetitorAnalysis } from "@/lib/agents/analista";
import { RESEARCH_CREDITS } from "@/lib/research/credits";
import { averagePerWeek, findOutliers, FREQUENCY_WEEKS, OUTLIER_THRESHOLD, performanceValue, postsPerWeek } from "@/lib/research/metrics";
import { derivedAllowed } from "@/lib/research/sync";
import { getCreditBalance, getProject, roleAtLeast } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";
import { CompetitorAnalysisPanel } from "../_components/analysis-panel";
import { CompetitorControls } from "../_components/competitor-controls";
import { YouTubeAttribution } from "../_components/shared";

export async function generateMetadata() {
  const t = await getTranslations("competitors");
  return { title: t("title") };
}

type Params = { params: Promise<{ projectId: string; competitorId: string }> };

export default async function CompetitorDetailPage({ params }: Params) {
  const { projectId, competitorId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(competitorId)) notFound();
  const t = await getTranslations("competitors");
  const format = await getFormatter();
  const project = await getProject(projectId);
  const canEdit = roleAtLeast(project.workspace.role, "editor");
  const supabase = await createClient();

  const { data: c } = await supabase.from("research_competitors").select("*").eq("id", competitorId).eq("project_id", projectId).maybeSingle();
  if (!c) notFound();
  const [{ data: postsData }, { data: analyses }, balance] = await Promise.all([
    supabase.from("research_competitor_posts").select("*").eq("competitor_id", c.id).order("published_at", { ascending: false }).limit(50),
    supabase.from("research_analyses").select("result, created_at").eq("subject_type", "competitor").eq("subject_id", c.id).order("created_at", { ascending: false }).limit(1),
    getCreditBalance(project.workspace_id),
  ]);
  const posts = postsData ?? [];
  const isYouTube = c.platform === "youtube";
  const derived = derivedAllowed(c.platform);
  const metricLabel = c.platform === "instagram" ? t("detail.interactions") : t("stats.views");

  const { median: med, outliers } = derived
    ? findOutliers(posts.map((p) => ({ ...p, id: p.id, publishedAt: p.published_at, value: performanceValue(p) })))
    : { median: null, outliers: [] };
  const weeks = derived ? postsPerWeek(posts.map((p) => p.published_at)) : [];
  const maxWeek = Math.max(1, ...weeks.map((w) => w.count));
  const top = [...posts].sort((a, b) => (performanceValue(b) ?? -1) - (performanceValue(a) ?? -1)).slice(0, 10);

  const n = (v: number | null) => (v === null ? "—" : format.number(v, { notation: "compact", maximumFractionDigits: 1 }));
  const date = (d: string | null) => (d ? format.dateTime(new Date(d), { dateStyle: "medium" }) : "—");
  const last = analyses?.[0] ? { result: analyses[0].result as unknown as CompetitorAnalysis, createdAt: analyses[0].created_at } : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href={`/app/p/${projectId}/competitors`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {t("back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {c.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.avatar_url} alt="" className="size-14 rounded-full border object-cover" referrerPolicy="no-referrer" />
          ) : (
            <PlatformIcon platform={c.platform} className="size-14" />
          )}
          <div className="min-w-0">
            <p className="label-mono">{project.name}</p>
            <h1 className="truncate text-[28px] leading-tight font-medium">{c.display_name ?? c.handle}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <PlatformIcon platform={c.platform} className="size-5 text-[8px]" />
              {c.handle}
              {c.profile_url && (
                <a href={c.profile_url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">
                  {t("detail.openProfile")} <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
            </p>
          </div>
        </div>
        {canEdit && <CompetitorControls projectId={projectId} competitorId={c.id} />}
      </div>

      <p className="text-xs text-muted-foreground">
        {c.last_fetched_at ? t("updated", { when: format.relativeTime(new Date(c.last_fetched_at)) }) : t("neverUpdated")}
        {c.fetch_error && (
          <span className="ml-2 inline-flex items-center gap-1 text-warning">
            <AlertTriangle className="size-3.5" aria-hidden /> {t.has(`fetchErrors.${c.fetch_error}`) ? t(`fetchErrors.${c.fetch_error}`) : t("fetchError")}
          </span>
        )}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={isYouTube ? t("stats.subscribers") : t("stats.followers")} value={n(c.followers)} trend="flat" icon={Users} />
        <StatCard label={t("stats.totalViews")} value={n(c.total_views)} trend="flat" icon={Eye} />
        <StatCard label={isYouTube ? t("stats.videos") : t("stats.posts")} value={n(c.media_count)} trend="flat" icon={FileVideo} />
        <StatCard
          label={t("stats.perWeek")}
          value={derived ? format.number(averagePerWeek(weeks), { maximumFractionDigits: 1 }) : "—"}
          delta={derived && isYouTube ? t("calculatedByKreo") : undefined}
          trend="flat"
          icon={CalendarDays}
        />
      </div>

      {!derived && (
        <p role="note" className="rounded-md border border-info/40 bg-info/10 px-3 py-2 text-sm text-info">
          {t("youtubeDerivedLocked")}
        </p>
      )}

      {derived && (
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.frequencyTitle", { weeks: FREQUENCY_WEEKS })}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex h-36 items-end gap-2" aria-label={t("detail.frequencyTitle", { weeks: FREQUENCY_WEEKS })}>
              {weeks.map((w) => (
                <li key={w.weekStart} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="font-mono text-xs tabular-nums">{w.count}</span>
                  <span className="w-full rounded-t-sm bg-[var(--chart-1)]" style={{ height: `${Math.max(2, (w.count / maxWeek) * 100)}%` }} aria-hidden />
                  <span className="text-[10px] text-muted-foreground">{format.dateTime(new Date(w.weekStart), { day: "numeric", month: "short" })}</span>
                  <span className="sr-only">{t("detail.weekOf", { date: w.weekStart, count: w.count })}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {derived && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="size-4 text-brand-amber-ink" aria-hidden /> {t("detail.outliersTitle")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("detail.outliersHint", { threshold: OUTLIER_THRESHOLD, metric: metricLabel, median: med === null ? "—" : n(med) })}
              {isYouTube && ` ${t("calculatedByKreo")}`}
            </p>
          </CardHeader>
          <CardContent>
            {outliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("detail.noOutliers")}</p>
            ) : (
              <ul className="divide-y">
                {outliers.map(({ post: p, multiple }) => (
                  <li key={p.id} className="flex items-center gap-3 py-2">
                    <span className="w-14 shrink-0 rounded-sm border bg-secondary px-1.5 py-0.5 text-center font-mono text-xs font-semibold text-foreground tabular-nums">
                      {format.number(multiple, { maximumFractionDigits: 1 })}×
                    </span>
                    <PostLine p={p} metricLabel={metricLabel} n={n} date={date} untitled={t("untitled")} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("detail.topTitle", { metric: metricLabel })}</CardTitle>
        </CardHeader>
        <CardContent>
          {top.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("detail.noPosts")}</p>
          ) : (
            <ul className="divide-y">
              {top.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  {p.thumbnail_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnail_url} alt="" className="hidden aspect-video w-24 shrink-0 rounded-sm border object-cover sm:block" referrerPolicy="no-referrer" loading="lazy" />
                  )}
                  <PostLine p={p} metricLabel={metricLabel} n={n} date={date} untitled={t("untitled")} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("analysis.title")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("analysis.subtitle")}</p>
        </CardHeader>
        <CardContent>
          {!isAgentsConfigured() && (
            <p role="note" className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              {t("analysis.notConfigured")}
            </p>
          )}
          <CompetitorAnalysisPanel
            competitorId={c.id}
            credits={RESEARCH_CREDITS.analyzeCompetitor}
            balance={balance}
            enabled={canEdit && derived && isAgentsConfigured() && posts.length > 0}
            initial={last}
          />
        </CardContent>
      </Card>

      {isYouTube && <YouTubeAttribution />}
    </div>
  );
}

function PostLine({
  p,
  metricLabel,
  n,
  date,
  untitled,
}: {
  p: { title: string | null; url: string | null; published_at: string | null; views: number | null; likes: number | null; comments: number | null };
  metricLabel: string;
  n: (v: number | null) => string;
  date: (d: string | null) => string;
  untitled: string;
}) {
  const value = performanceValue(p);
  return (
    <div className="min-w-0 flex-1">
      {p.url ? (
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-sm hover:underline">
          {p.title || untitled}
        </a>
      ) : (
        <p className="line-clamp-2 text-sm">{p.title || untitled}</p>
      )}
      <p className="flex flex-wrap items-center gap-x-2 font-mono text-xs text-muted-foreground tabular-nums">
        <span>{date(p.published_at)}</span>
        <span>
          {n(value)} {metricLabel.toLowerCase()}
        </span>
        {p.likes !== null && (
          <span className="inline-flex items-center gap-0.5">
            <Heart className="size-3" aria-hidden /> {n(p.likes)}
          </span>
        )}
        {p.comments !== null && (
          <span className="inline-flex items-center gap-0.5">
            <MessageCircle className="size-3" aria-hidden /> {n(p.comments)}
          </span>
        )}
      </p>
    </div>
  );
}
