"use client";

import { Coins } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Coste en créditos (mismo aspecto que `CreditCost` de Kreo, pero traducido). Se muestra SIEMPRE antes de lanzar la IA.
 * Incluye el saldo si se conoce, para que el usuario sepa si le llega.
 */
export function Cost({ credits, balance, className }: { credits: number; balance?: number; className?: string }) {
  const t = useTranslations("common");
  const ts = useTranslations("strategy.common");
  const short = balance !== undefined && balance < credits;
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground", short && "text-destructive", className)}>
      <Coins className="size-3.5" strokeWidth={1.5} aria-hidden />
      {t("credits", { count: credits })}
      {balance !== undefined && <span className="text-muted-foreground">· {ts("balance", { count: balance })}</span>}
    </span>
  );
}
