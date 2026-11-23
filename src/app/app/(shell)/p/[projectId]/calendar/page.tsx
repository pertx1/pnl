import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Plus, Sparkles, X } from "lucide-react";
import { CalendarView } from "@/components/calendar/calendar-view";
import { StatusBadge } from "@/components/kreo/status-badge";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCalendarPosts, getPostsByStatus, isFilterableStatus } from "@/lib/server/calendar";
import { getProject, roleAtLeast } from "@/lib/server/dal";
import { reschedulePost } from "../posts/actions";

export async function generateMetadata() {
  const t = await getTranslations("calendar");
  return { title: t("title") };
}

export default async function ProjectCalendarPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ view?: string; d?: string; status?: string }> }) {
  const { projectId } = await params;
  const { view, d, status } = await searchParams;
  const t = await getTranslations("calendar");
  const tp = await getTranslations("posts");
  const format = await getFormatter();
  const project = await getProject(projectId);
  // ?status=… (enlaces del panel): lista filtrada por estado en lugar del calendario.
  const filter = isFilterableStatus(status) ? status : null;
  const [posts, filtered] = await Promise.all([filter ? Promise.resolve([]) : getCalendarPosts({ projectId }, d), filter ? getPostsByStatus(projectId, filter) : Promise.resolve([])]);
  const canEdit = roleAtLeast(project.workspace.role, "editor");
  const v = view === "week" || view === "list" ? view : "month";

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-mono">{project.name}</p>
          <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>
        </div>
        {canEdit && (
          <Button asChild>
            <Link href={`/app/p/${projectId}/posts/new`}>
              <Plus /> {tp("new")}
            </Link>
          </Button>
        )}
      </div>
      {filter ? (
        <section aria-labelledby="filter-title" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="filter-title" className="font-medium">
                {t("filterTitle", { status: tp(`status.${filter}`) })}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("filterCount", { count: filtered.length })}
                {filter === "failed" && filtered.length > 0 && ` ${t("filterFailedHint")}`}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/p/${projectId}/calendar`}>
                <X /> {t("filterClear")}
              </Link>
            </Button>
          </div>
          {filtered.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {filtered.map((p) => (
                <li key={p.id}>
                  <Link href={`/app/p/${projectId}/posts/${p.id}`} className="flex min-h-11 flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-secondary/50">
                    <span className="w-36 font-mono text-xs text-muted-foreground tabular-nums">
                      {p.scheduledAt ? format.dateTime(new Date(p.scheduledAt), { dateStyle: "medium", timeStyle: "short" }) : t("filterNoDate")}
                    </span>
                    <span className="flex gap-1">
                      {p.platforms.map((pl) => (
                        <PlatformIcon key={pl} platform={pl} label className="size-5 text-[8px]" />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.title || p.caption.slice(0, 80) || "—"}</span>
                    {p.aiGenerated && <Sparkles className="size-3.5 text-brand-amber-ink" aria-label={t("aiLabel")} />}
                    <StatusBadge status={p.status as Parameters<typeof StatusBadge>[0]["status"]} label={tp(`status.${p.status}`)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <CalendarView
          key={`${v}-${d ?? ""}`}
          posts={posts}
          view={v}
          day={d}
          reschedule={reschedulePost}
          newPostBase={canEdit ? `/app/p/${projectId}/posts/new` : undefined}
        />
      )}
      <Card>
        <CardContent>
          <h2 className="label-mono">{t("bestTimes")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("bestTimesEmpty")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
