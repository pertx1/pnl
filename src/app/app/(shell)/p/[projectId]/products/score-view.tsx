"use client";

import { useTranslations } from "next-intl";
import type { ScoreFactor } from "@/lib/research/score";
import { cn } from "@/lib/utils";

/** Puntuación 0–100 con texto (no solo color). */
export function ScoreBadge({ score }: { score: number | null }) {
  const t = useTranslations("products.score");
  if (score === null) return null;
  const level = score >= 70 ? "high" : score >= 40 ? "mid" : "low";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 flex-col items-center rounded-md border px-2 py-1 leading-none",
        level === "high" ? "border-selected/50 bg-primary/10" : level === "mid" ? "border-warning/40 bg-warning/10" : "border-border",
      )}
      title={t("tooltip")}
    >
      <span className="font-mono text-lg font-semibold tabular-nums">{score}</span>
      <span className="label-mono !text-[8px]">{t(`level.${level}`)}</span>
    </span>
  );
}

/** Desglose explicable de la puntuación. */
export function ScoreFactors({ factors }: { factors: ScoreFactor[] }) {
  const t = useTranslations("products.score");
  return (
    <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2" aria-label={t("breakdown")}>
      {factors.map((f) => (
        <li key={f.key} className="flex items-center gap-2">
          <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <span className="block h-full bg-[var(--chart-1)]" style={{ width: `${(f.points / f.max) * 100}%` }} />
          </span>
          <span className="text-muted-foreground">
            {t(`factors.${f.key}`, { value: f.value === null ? "—" : f.key === "reach" ? Intl.NumberFormat(undefined, { notation: "compact" }).format(f.value) : f.value })}
          </span>
          <span className="ml-auto font-mono tabular-nums">
            {f.points}/{f.max}
          </span>
        </li>
      ))}
    </ul>
  );
}
