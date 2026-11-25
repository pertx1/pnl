"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarDays, Plus } from "lucide-react";
import { EmptyState } from "@/components/kreo/empty-state";
import { PostThumb, type ThumbCover } from "@/components/kreo/post-thumb";
import { StatusBadge, type PostStatus } from "@/components/kreo/status-badge";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { DEFAULT_TZ, weekStrip } from "@/lib/dashboard/stats";
import { cn } from "@/lib/utils";

export type WeekPost = { id: string; title: string | null; caption: string; status: string; scheduledAt: string; platforms: string[]; cover?: ThumbCover | null };

const noop = () => () => {};
/** Zona horaria del navegador; en el servidor (y al hidratar) se usa la de Kreo para que no haya desajustes. */
function useTimeZone() {
  return useSyncExternalStore(
    noop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ,
    () => DEFAULT_TZ,
  );
}

/** Próximos 7 días: tira con el número de publicaciones de cada día y lista con hora local, red y estado. */
export function WeekAhead({ posts, nowIso, base, canCreate }: { posts: WeekPost[]; nowIso: string; base: string; canCreate: boolean }) {
  const t = useTranslations("projects.dashboard");
  const tp = useTranslations("projects");
  const ts = useTranslations("posts.status");
  const format = useFormatter();
  const timeZone = useTimeZone();
  const strip = weekStrip(
    posts.map((p) => p.scheduledAt),
    nowIso,
    timeZone,
  );
  const dayDate = (day: string) => new Date(`${day}T12:00:00Z`);
  const shown = posts.slice(0, 8);

  return (
    <div className="space-y-4">
      <ol className="grid grid-cols-7 gap-1 sm:gap-2" aria-label={t("weekStripLabel")}>
        {strip.map((d) => {
          const weekday = format.dateTime(dayDate(d.day), { weekday: "short", timeZone: "UTC" });
          const num = format.dateTime(dayDate(d.day), { day: "numeric", timeZone: "UTC" });
          const full = format.dateTime(dayDate(d.day), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
          return (
            <li key={d.day}>
              <Link
                href={`${base}/calendar?view=week&d=${d.day}`}
                aria-label={`${full}: ${t("postsCount", { count: d.count })}`}
                aria-current={d.isToday ? "date" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border px-0.5 py-2 text-center transition-colors hover:border-border-strong hover:bg-accent/40",
                  d.isToday && "border-selected",
                )}
              >
                <span className="label-mono text-[10px] tracking-normal sm:tracking-[0.1em]">{weekday.replace(".", "")}</span>
                <span className="text-sm font-medium tabular-nums">{num}</span>
                <span className={cn("font-mono text-xs tabular-nums", d.count ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {d.count ? d.count : "·"}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      {shown.length === 0 ? (
        <EmptyState icon={CalendarDays} body={t("weekEmpty")} compact>
          {canCreate && (
            <Button asChild variant="outline">
              <Link href={`${base}/posts/new`}>
                <Plus /> {tp("newPost")}
              </Link>
            </Button>
          )}
        </EmptyState>
      ) : (
        <ul className="-mx-2 divide-y">
          {shown.map((p) => (
            <li key={p.id}>
              <Link href={`${base}/posts/${p.id}`} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2 py-2 hover:bg-accent/40 sm:flex-nowrap">
                <PostThumb cover={p.cover} className="size-11 shrink-0 rounded-xl" />
                <time dateTime={p.scheduledAt} className="w-24 shrink-0 font-mono text-xs text-muted-foreground tabular-nums sm:w-28">
                  {format.dateTime(new Date(p.scheduledAt), { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone })}
                </time>
                <span className="flex shrink-0 gap-1">
                  {p.platforms.length ? (
                    [...new Set(p.platforms)].map((pl) => <PlatformIcon key={pl} platform={pl} label className="size-5 text-[8px]" />)
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("noNetwork")}</span>
                  )}
                </span>
                <span className="order-last w-full min-w-0 truncate text-sm sm:order-none sm:w-auto sm:flex-1">{p.title?.trim() || p.caption.trim() || tp("noCaption")}</span>
                <StatusBadge status={p.status as PostStatus} label={ts(p.status)} className="ml-auto sm:ml-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {posts.length > shown.length && (
        <p className="text-xs text-muted-foreground">{t("moreThisWeek", { count: posts.length - shown.length })}</p>
      )}
    </div>
  );
}
