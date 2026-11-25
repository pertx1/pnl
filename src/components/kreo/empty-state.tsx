import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconBubble, type BubbleTone } from "./icon-bubble";

/** Estado vacío ilustrado: icono grande con fondo suave, una frase y la acción que lo resuelve. */
export function EmptyState({
  icon,
  tone = "neutral",
  title,
  body,
  children,
  className,
  compact = false,
}: {
  icon: LucideIcon;
  tone?: BubbleTone;
  title?: string;
  body?: string;
  children?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-2xl border border-dashed text-center", compact ? "px-4 py-6" : "px-6 py-10", className)}>
      <IconBubble icon={icon} tone={tone} size={compact ? "lg" : "xl"} />
      {title && <p className="font-heading text-base font-semibold">{title}</p>}
      {body && <p className="max-w-md text-sm text-muted-foreground">{body}</p>}
      {children && <div className="flex flex-wrap justify-center gap-2 pt-1">{children}</div>}
    </div>
  );
}
