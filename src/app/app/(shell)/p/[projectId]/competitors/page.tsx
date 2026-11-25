import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { AlertTriangle, Bell, ChevronRight, Swords } from "lucide-react";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isYouTubeConfigured } from "@/lib/research/config";
import { RESEARCH_CREDITS } from "@/lib/research/credits";
import { getProject, roleAtLeast } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";
import { MarkAlertsSeenButton } from "./_components/competitor-controls";
import { FollowForm } from "./_components/follow-form";
import { YouTubeAttribution } from "./_components/shared";

export async function generateMetadata() {
  const t = await getTranslations("competitors");
  return { title: t("title") };
}

export default async function CompetitorsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const t = await getTranslations("competitors");
  const format = await getFormatter();
  const project = await getProject(projectId);
  const canEdit = roleAtLeast(project.workspace.role, "editor");
  const supabase = await createClient();

  const [{ data: competitors }, { data: alerts }, { data: igAccounts }] = await Promise.all([
    supabase
      .from("research_competitors")
      .select("id, platform, handle, display_name, avatar_url, followers, total_views, media_count, last_fetched_at, fetch_error")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("research_alerts")
      .select("id, multiple, created_at, competitor_id, research_competitor_posts!inner(title, url), research_competitors!inner(display_name, handle, platform)")
      .eq("project_id", projectId)
      .is("seen_at", null)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("social_accounts").select("handle").eq("project_id", projectId).eq("platform", "instagram").eq("status", "active").order("created_at").limit(1),
  ]);

  const list = competitors ?? [];
  const n = (v: number | null) => (v === null ? "—" : format.number(v, { notation: "compact", maximumFractionDigits: 1 }));
  const hasYouTube = list.some((c) => c.platform === "youtube");
  const igHandle = igAccounts?.[0] ? `@${(igAccounts[0].handle ?? "").replace(/^@/, "")}` : null;

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-6">
      <div>
        <h1 className="page-title">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {(alerts?.length ?? 0) > 0 && (
        <Card className="border-selected/40">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Bell className="size-4 text-muted-foreground" aria-hidden />
              {t("alerts.title", { count: alerts!.length })}
            </CardTitle>
            {canEdit && <MarkAlertsSeenButton projectId={projectId} />}
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {alerts!.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="rounded-sm border bg-secondary px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground tabular-nums">
                    {format.number(Number(a.multiple), { maximumFractionDigits: 1 })}×
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{a.research_competitor_posts.title ?? t("untitled")}</span>
                    <span className="text-xs text-muted-foreground">
                      {a.research_competitors.display_name ?? a.research_competitors.handle} · {format.relativeTime(new Date(a.created_at))}
                    </span>
                  </span>
                  <Link href={`/app/p/${projectId}/competitors/${a.competitor_id}`} className="link text-xs">
                    {t("alerts.view")}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">{t("alerts.hint")}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("add")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FollowForm projectId={projectId} canEdit={canEdit} youtubeReady={isYouTubeConfigured()} instagramAccount={igHandle} tiktokCredits={RESEARCH_CREDITS.tiktokProfile} />
        </CardContent>
      </Card>

      <section aria-labelledby="following-title" className="space-y-3">
        <h2 id="following-title" className="label-mono">
          {t("following", { count: list.length })}
        </h2>
        {list.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
            <Swords className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <p className="font-medium">{t("empty.title")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("empty.body")}</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/app/p/${projectId}/competitors/${c.id}`}
                  className="group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-selected/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <div className="flex items-center gap-3">
                    {c.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.avatar_url} alt="" className="size-10 rounded-full border object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <PlatformIcon platform={c.platform} className="size-10" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.display_name ?? c.handle}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <PlatformIcon platform={c.platform} className="size-4 text-[7px]" /> {c.handle}
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground" aria-hidden />
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <dt className="label-mono !text-[9px]">{c.platform === "youtube" ? t("stats.subscribers") : t("stats.followers")}</dt>
                      <dd className="font-mono text-sm tabular-nums">{n(c.followers)}</dd>
                    </div>
                    <div>
                      <dt className="label-mono !text-[9px]">{t("stats.views")}</dt>
                      <dd className="font-mono text-sm tabular-nums">{n(c.total_views)}</dd>
                    </div>
                    <div>
                      <dt className="label-mono !text-[9px]">{c.platform === "youtube" ? t("stats.videos") : t("stats.posts")}</dt>
                      <dd className="font-mono text-sm tabular-nums">{n(c.media_count)}</dd>
                    </div>
                  </dl>
                  <p className="mt-auto flex items-center gap-1 text-xs text-muted-foreground">
                    {c.fetch_error ? (
                      <>
                        <AlertTriangle className="size-3.5 text-warning" aria-hidden /> {t("fetchError")}
                      </>
                    ) : c.last_fetched_at ? (
                      t("updated", { when: format.relativeTime(new Date(c.last_fetched_at)) })
                    ) : (
                      t("neverUpdated")
                    )}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {hasYouTube && <YouTubeAttribution />}
      <p className="text-xs text-muted-foreground">{t("legalNote")}</p>
    </div>
  );
}
