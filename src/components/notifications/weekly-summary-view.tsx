import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WeeklySummary } from "@/lib/notifications/weekly-core";

/** Vista del resumen semanal guardado en un aviso `weekly_summary`. */
export async function WeeklySummaryView({ s }: { s: WeeklySummary }) {
  const t = await getTranslations("notifications.weekly");
  const format = await getFormatter();
  const day = (d: string) => format.dateTime(new Date(`${d}T12:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" });
  const n = (v: number | null) => (v === null ? "—" : format.number(v));
  const delta = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${format.number(v)}`);

  return (
    <div className="space-y-4">
      <p className="label-mono">{t("period", { from: day(s.period.from), to: day(s.period.to) })}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("posts")}</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-8">
            <div>
              <p className="font-mono text-2xl tabular-nums">{s.posts.published}</p>
              <p className="text-xs text-muted-foreground">{t("published")}</p>
            </div>
            <div>
              <p className={`font-mono text-2xl tabular-nums ${s.posts.failed ? "text-destructive" : ""}`}>{s.posts.failed}</p>
              <p className="text-xs text-muted-foreground">{t("failed")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("overdue")}</CardTitle>
          </CardHeader>
          <CardContent>
            {s.overdueTasks.count === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noOverdue")}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {s.overdueTasks.items.map((task) => (
                  <li key={task.id} className="flex justify-between gap-3">
                    <span className="truncate">{task.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{t("due", { date: day(task.due) })}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("followers")}</CardTitle>
          <CardDescription>{t("followersNote")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 overflow-x-auto">
          {s.accounts.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="label-mono py-2 pr-4 font-normal">{t("account")}</th>
                  <th className="label-mono py-2 pr-4 text-right font-normal">{t("current")}</th>
                  <th className="label-mono py-2 text-right font-normal">{t("change")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {s.accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-4">
                      <span className="flex items-center gap-2">
                        <PlatformIcon platform={a.platform} className="size-6 text-[9px]" />
                        {a.label}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{a.followers === null ? t("noMetrics") : n(a.followers)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{delta(a.change)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {s.youtube.length > 0 && (
            <div className="space-y-2">
              <p className="label-mono">{t("youtube")}</p>
              <ul className="space-y-1 text-sm">
                {s.youtube.map((y) => (
                  <li key={y.id} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <PlatformIcon platform="youtube" className="size-6 text-[9px]" />
                      {y.label}
                    </span>
                    <span className="font-mono tabular-nums">
                      {y.subscribers === null ? t("noMetrics") : `${n(y.subscribers)} ${t("subscribers").toLowerCase()}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {s.accounts.length === 0 && s.youtube.length === 0 && <p className="text-sm text-muted-foreground">{t("noMetrics")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("nextWeek")}</CardTitle>
        </CardHeader>
        <CardContent>
          {s.upcoming.count === 0 ? (
            <p className="text-sm text-muted-foreground">{t("nothingScheduled")}</p>
          ) : (
            <ul className="divide-y text-sm">
              {s.upcoming.items.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/app/p/${s.project.id}/posts/${u.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
                    {u.platforms.map((p) => (
                      <PlatformIcon key={p} platform={p} className="size-5 text-[8px]" />
                    ))}
                    <span className="truncate">{u.title ?? t("untitled")}</span>
                  </Link>
                  <time dateTime={u.at} className="shrink-0 text-xs text-muted-foreground">
                    {format.dateTime(new Date(u.at), { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: s.timezone })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Link href={`/app/p/${s.project.id}`} className="inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        {t("openProject")}
      </Link>
    </div>
  );
}
