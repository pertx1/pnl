import { cn } from "@/lib/utils";
import { WORDMARK_PATH, WORDMARK_WIDTH } from "./wordmark-path";

/** Símbolo de Kreo: triángulo de crecimiento en lima. Usa el token --brand-mark (se adapta al tema). */
export function KreoMark({ className, title = "Kreo" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} role="img" aria-label={title}>
      <path fill="var(--brand-mark)" d="M3 29 L29 3 L29 29 Z" />
    </svg>
  );
}

/**
 * Logo completo: triángulo + "kreo" en minúsculas + cursor de terminal.
 * La altura se controla con className (p. ej. "h-8"). `blink` anima el cursor (solo en landing/hero).
 */
export function KreoLogo({ className, blink = false }: { className?: string; blink?: boolean }) {
  const tx = 70;
  const cx = Math.round(tx + WORDMARK_WIDTH + 8);
  return (
    <svg viewBox={`0 0 ${cx + 40} 74`} className={cn("h-8 w-auto", className)} role="img" aria-label="Kreo">
      <path fill="var(--brand-mark)" d="M0 72 L56 16 L56 72 Z" />
      <path transform={`translate(${tx} 72)`} fill="currentColor" d={WORDMARK_PATH} />
      <rect
        x={cx}
        y={61}
        width={40}
        height={11}
        fill="var(--brand-mark)"
        className={blink ? "motion-safe:animate-[kreo-blink_1.1s_steps(1)_infinite]" : undefined}
      />
    </svg>
  );
}
