"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { scoreAt, type BestTimePlatform, type BestTimesResult } from "@/lib/analytics/best-time";
import { cn } from "@/lib/utils";

/**
 * Pista reutilizable de «mejor hora» (p. ej. junto al selector de fecha del editor).
 * Uso: calcula `result` en el servidor con `loadProjectBestTimes()` (src/lib/analytics/best-time-data.ts) y pásalo.
 *  <BestTimeHint platform="instagram" result={best.get(projectId)?.get("instagram")} scheduledAt={isoOrNull} />
 * - Con `scheduledAt`: si la hora puntúa ≥ 75/100 dice «Buena hora»; si no, propone las 3 mejores franjas.
 * - Sin `scheduledAt`: muestra las 3 mejores franjas.
 * Marca «orientativo» cuando solo hay patrón por defecto (siempre en YouTube).
 */
export type BestTimeHintResult = Pick<BestTimesResult, "grid" | "timezone" | "top" | "source">;
const GOOD = 75;
const PLATFORM: Record<BestTimePlatform, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };

export function BestTimeHint({
  platform,
  result,
  scheduledAt,
  className,
}: {
  platform: BestTimePlatform;
  result: BestTimeHintResult | null | undefined;
  scheduledAt?: string | null;
  className?: string;
}) {
  const t = useTranslations("bestTimes");
  const format = useFormatter();
  if (!result?.top.length) return null;

  // 2026-11-23 fue lunes: sirve de referencia para el nombre corto de cada día en el idioma del usuario.
  const dayName = (weekday: number) => format.dateTime(new Date(Date.UTC(2026, 10, 23 + weekday, 12)), { weekday: "short", timeZone: "UTC" });
  const slots = result.top
    .slice(0, 3)
    .map((s) => `${dayName(s.weekday)} ${String(s.hour).padStart(2, "0")}:00`)
    .join(" · ");
  const at = scheduledAt ? new Date(scheduledAt) : null;
  const good = at && !Number.isNaN(at.getTime()) ? scoreAt(result, at) >= GOOD : false;
  const name = PLATFORM[platform];

  return (
    <p className={cn("flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground", className)} aria-live="polite">
      <Clock className={cn("size-3.5", good && "text-primary-ink")} strokeWidth={1.5} aria-hidden />
      <span>{good ? t("hintGood", { platform: name }) : t(at ? "hintBetter" : "hintGeneric", { platform: name, slots })}</span>
      {result.source === "default" && <span className="label-mono !text-[9px]">{t("orientative")}</span>}
    </p>
  );
}
