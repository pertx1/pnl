import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

/** Coste en créditos que se muestra SIEMPRE antes de lanzar una acción de pago. */
export function CreditCost({ credits, className }: { credits: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground", className)}>
      <Coins className="size-3.5" aria-hidden />
      {credits} {credits === 1 ? "crédito" : "créditos"}
    </span>
  );
}
