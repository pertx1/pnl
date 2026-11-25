import { projectColorIndex, projectInitials } from "@/lib/projects/identity";
import { cn } from "@/lib/utils";

/** Colores de proyecto (series de gráficas, en este orden para no empezar por la lima). Siempre acompañan al nombre. */
const PROJECT_COLORS = ["bg-chart-3", "bg-chart-2", "bg-chart-4", "bg-chart-5", "bg-chart-1"] as const;

export function projectColor(index: number) {
  return PROJECT_COLORS[((index % PROJECT_COLORS.length) + PROJECT_COLORS.length) % PROJECT_COLORS.length];
}

/**
 * Punto de color del proyecto (decorativo: el nombre va al lado).
 * Pasa `id` para el color estable del proyecto (el mismo en toda la app); `index` queda por compatibilidad.
 */
export function ProjectDot({ id, index = 0, className }: { id?: string; index?: number; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", projectColor(id ? projectColorIndex(id) : index), className)} />;
}

/**
 * Avatar del proyecto: iniciales sobre su color. Decorativo (el nombre siempre va al lado o en la etiqueta del control).
 * Texto en el color del fondo: oscuro sobre los colores claros del modo oscuro y blanco sobre los del modo claro.
 */
export function ProjectAvatar({ id, name, className }: { id: string; name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl font-heading text-[13px] leading-none font-bold tracking-tight text-background select-none",
        projectColor(projectColorIndex(id)),
        className,
      )}
    >
      {projectInitials(name)}
    </span>
  );
}
