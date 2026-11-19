import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Etiqueta "Generado con IA". Obligatoria en todo asset/publicación generado con IA
 * (transparencia AI Act + etiquetas de TikTok, Instagram y YouTube). Ver docs/compliance.md.
 */
export function AiBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      <Sparkles className="size-3 text-brand-amber-ink" aria-hidden />
      Generado con IA
    </span>
  );
}
