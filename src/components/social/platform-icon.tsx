import { cn } from "@/lib/utils";

/** Iconos de marca simplificados (monograma) para no reproducir logos con licencia. */
const STYLES: Record<string, { label: string; className: string }> = {
  tiktok: { label: "TT", className: "bg-foreground text-background" },
  instagram: { label: "IG", className: "bg-[#C13584] text-white" },
  youtube: { label: "YT", className: "bg-[#FF0000] text-white" },
};

export function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const s = STYLES[platform] ?? { label: "?", className: "bg-muted" };
  return (
    <span aria-hidden className={cn("inline-grid size-8 shrink-0 place-items-center rounded-md font-mono text-[11px] font-bold", s.className, className)}>
      {s.label}
    </span>
  );
}
