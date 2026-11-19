import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRight, Gauge } from "lucide-react";
import type { LimitStatus } from "@/lib/billing/limits";
import { cn } from "@/lib/utils";

/**
 * Aviso reutilizable "has llegado al límite → mejora tu plan" (Server Component).
 * Uso: `<LimitNotice status={usage.limits.projects} />`. No muestra nada si queda margen (salvo `always`).
 */
export async function LimitNotice({ status, always, className }: { status: LimitStatus; always?: boolean; className?: string }) {
  if (!always && !status.reached && !status.near) return null;
  const t = await getTranslations("plans");
  const what = t(`limitKinds.${status.kind}`);
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm",
        status.reached ? "border-warning/40 bg-warning/10" : "border-border bg-card",
        className,
      )}
    >
      <Gauge className={cn("size-4 shrink-0", status.reached ? "text-warning" : "text-muted-foreground")} strokeWidth={1.5} aria-hidden />
      <p className="min-w-0 flex-1">
        {status.reached ? t("limitReached", { what, max: status.max }) : t("limitNear", { what, used: status.used, max: status.max })}
      </p>
      <Link href="/app/billing#plans" className="link inline-flex items-center gap-1 font-medium">
        {t("upgrade")} <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}

/** Barra de uso de un límite. */
export function UsageMeter({ label, status }: { label: string; status: LimitStatus }) {
  const pct = Math.min(100, Math.round(status.ratio * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {status.used}/{status.max}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={status.max}
        aria-valuenow={status.used}
      >
        <div
          className={cn("h-full rounded-full", status.reached ? "bg-warning" : status.near ? "bg-brand-amber" : "bg-foreground/70")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
