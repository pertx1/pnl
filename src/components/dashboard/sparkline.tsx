import { cn } from "@/lib/utils";

/**
 * Mini gráfica de línea (SVG propio, sin librerías). Decorativa en tamaño pero accesible:
 * `role="img"` y un `label` que resume la tendencia en texto (obligatorio).
 * Color: texto actual (por defecto neutro); el acento se reserva para lo importante.
 */
export function Sparkline({ values, label, className }: { values: number[]; label: string; className?: string }) {
  const W = 120;
  const H = 32;
  const pad = 2;
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (values.length - 1);
  // Serie plana: línea centrada (no pegada al borde inferior).
  const y = (v: number) => (max === min ? H / 2 : pad + (1 - (v - min) / span) * (H - pad * 2));
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${d}L${x(values.length - 1).toFixed(1)},${H}L${x(0).toFixed(1)},${H}Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("h-8 w-full overflow-visible", className)} role="img" aria-label={label}>
      <path d={area} fill="currentColor" opacity={0.08} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values.at(-1)!)} r={2} fill="currentColor" />
    </svg>
  );
}

/** Barras verticales mínimas (p. ej. publicaciones por semana). La última barra es la actual. */
export function MiniBars({ values, label, className }: { values: number[]; label: string; className?: string }) {
  const max = Math.max(...values, 1);
  return (
    <div role="img" aria-label={label} className={cn("flex h-12 items-end gap-1.5", className)}>
      {values.map((v, i) => (
        <span
          key={i}
          aria-hidden
          className={cn("flex-1 rounded-sm", i === values.length - 1 ? "bg-foreground/70" : "bg-foreground/25")}
          style={{ height: `${Math.max((v / max) * 100, v > 0 ? 8 : 4)}%` }}
        />
      ))}
    </div>
  );
}
