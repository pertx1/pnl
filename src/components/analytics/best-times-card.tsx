import { getFormatter, getTranslations } from "next-intl/server";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MIN_SAMPLES, type BestTimePlatform, type BestTimesResult } from "@/lib/analytics/best-time";

/** Tarjeta «Mejores horas» de Analíticas: las 3 mejores franjas por red, con su origen (orientativo / historial). */
export async function BestTimesCard({ results }: { results: Map<BestTimePlatform, BestTimesResult> | undefined }) {
  const t = await getTranslations("bestTimes");
  const format = await getFormatter();
  const dayName = (weekday: number) => format.dateTime(new Date(Date.UTC(2026, 10, 23 + weekday, 12)), { weekday: "long", timeZone: "UTC" });
  const entries = [...(results ?? new Map<BestTimePlatform, BestTimesResult>()).entries()];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noAccounts")}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {entries.map(([platform, r]) => (
              <div key={platform} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <PlatformIcon platform={platform} className="size-6 text-[9px]" label />
                  <span className="label-mono !text-[10px]">{t(`source.${r.source}`, { samples: r.samples })}</span>
                </div>
                <ol className="space-y-1.5">
                  {r.top.slice(0, 3).map((s) => (
                    <li key={`${s.weekday}-${s.hour}`} className="flex items-center gap-2 text-sm">
                      <span className="w-24 truncate capitalize">{dayName(s.weekday)}</span>
                      <span className="font-mono tabular-nums">{String(s.hour).padStart(2, "0")}:00</span>
                      <span className="ml-auto h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${s.score}%` }} />
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t("defaultNote", { min: MIN_SAMPLES })}</p>
        {entries.some(([p]) => p === "youtube") && <p className="text-xs text-muted-foreground">{t("youtubeNote")}</p>}
      </CardContent>
    </Card>
  );
}
