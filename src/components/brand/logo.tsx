import { useId } from "react";
import { cn } from "@/lib/utils";
import { WORDMARK_PATH, WORDMARK_WIDTH } from "./wordmark-path";

/** Símbolo de Kreo: órbita con degradado cian→magenta + satélite. Usa los tokens de marca. */
export function KreoMark({ className, title = "Kreo" }: { className?: string; title?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} role="img" aria-label={title}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand-cyan)" />
          <stop offset="1" stopColor="var(--brand-magenta)" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="11" fill="none" stroke={`url(#${id})`} strokeWidth="3.5" />
      <circle cx="25" cy="8" r="3.5" fill="var(--brand-magenta)" />
    </svg>
  );
}

/** Logo completo (símbolo + wordmark). La altura se controla con className (p. ej. "h-8"). */
export function KreoLogo({ className }: { className?: string }) {
  const id = useId();
  const w = Math.ceil(100 + WORDMARK_WIDTH);
  return (
    <svg viewBox={`0 0 ${w} 80`} className={cn("h-8 w-auto", className)} role="img" aria-label="Kreo">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand-cyan)" />
          <stop offset="1" stopColor="var(--brand-magenta)" />
        </linearGradient>
      </defs>
      <g transform="scale(2.5)">
        <circle cx="16" cy="16" r="11" fill="none" stroke={`url(#${id})`} strokeWidth="3.5" />
        <circle cx="25" cy="8" r="3.5" fill="var(--brand-magenta)" />
      </g>
      <path transform="translate(100 77.6)" fill="currentColor" d={WORDMARK_PATH} />
    </svg>
  );
}
