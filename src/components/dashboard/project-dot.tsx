import { cn } from "@/lib/utils";

/** Colores de proyecto (series de gráficas, en este orden para no empezar por la lima). Siempre acompañan al nombre. */
const PROJECT_COLORS = ["bg-chart-3", "bg-chart-2", "bg-chart-4", "bg-chart-5", "bg-chart-1"] as const;

export function projectColor(index: number) {
  return PROJECT_COLORS[((index % PROJECT_COLORS.length) + PROJECT_COLORS.length) % PROJECT_COLORS.length];
}

/** Punto de color del proyecto (decorativo: el nombre va al lado). */
export function ProjectDot({ index, className }: { index: number; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", projectColor(index), className)} />;
}
