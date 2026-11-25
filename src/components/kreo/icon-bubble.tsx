import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type BubbleTone = "neutral" | "primary" | "amber" | "info" | "success" | "warning" | "destructive";

const TONES: Record<BubbleTone, string> = {
  neutral: "bg-muted text-foreground",
  primary: "bg-primary/15 text-primary-ink",
  amber: "bg-brand-amber/15 text-brand-amber-ink",
  info: "bg-info/12 text-info",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  destructive: "bg-destructive/12 text-destructive",
};

const SIZES = {
  sm: "size-8 rounded-[10px] [&>svg]:size-4",
  md: "size-10 rounded-xl [&>svg]:size-5",
  lg: "size-12 rounded-2xl [&>svg]:size-6",
  xl: "size-16 rounded-3xl [&>svg]:size-8",
} as const;

/** Icono con fondo suave (dirección «Creador»). Decorativo: el texto que lo acompaña da el significado. */
export function IconBubble({ icon: Icon, tone = "neutral", size = "md", className }: { icon: LucideIcon; tone?: BubbleTone; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center", TONES[tone], SIZES[size], className)}>
      <Icon strokeWidth={1.75} />
    </span>
  );
}
