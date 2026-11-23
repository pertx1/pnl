import { BookOpen, Briefcase, Clapperboard, Dumbbell, Shapes, User, type LucideIcon } from "lucide-react";
import type { AgendaKind } from "@/lib/agenda/core";

/**
 * Estilo de cada tipo de bloque con los tokens de color (series de gráficas y estados). El tipo siempre se muestra
 * también con texto/icono: el color nunca es la única pista. La lima queda fuera (solo acción principal y selección).
 */
export const KIND_STYLE: Record<AgendaKind, { icon: LucideIcon; bar: string; tint: string; text: string }> = {
  work: { icon: Briefcase, bar: "bg-chart-3", tint: "bg-chart-3/12", text: "text-chart-3" },
  study: { icon: BookOpen, bar: "bg-chart-4", tint: "bg-chart-4/12", text: "text-chart-4" },
  sport: { icon: Dumbbell, bar: "bg-success", tint: "bg-success/12", text: "text-success" },
  personal: { icon: User, bar: "bg-chart-5", tint: "bg-chart-5/10", text: "text-chart-5" },
  creation: { icon: Clapperboard, bar: "bg-brand-amber", tint: "bg-brand-amber/14", text: "text-brand-amber-ink" },
  other: { icon: Shapes, bar: "bg-muted-foreground", tint: "bg-muted", text: "text-muted-foreground" },
};
