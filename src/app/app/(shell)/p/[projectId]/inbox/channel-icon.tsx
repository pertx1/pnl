import { cn } from "@/lib/utils";

/** Monograma por canal (no reproducimos logos con licencia, igual que PlatformIcon). */
const STYLES: Record<string, { label: string; className: string }> = {
  instagram: { label: "IG", className: "bg-[#C13584] text-white" },
  gmail: { label: "GM", className: "bg-[#D93025] text-white" },
  outlook: { label: "OL", className: "bg-[#0F6CBD] text-white" },
  tiktok: { label: "TT", className: "bg-foreground text-background" },
};

export function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  const s = STYLES[channel] ?? { label: "?", className: "bg-muted" };
  return (
    <span aria-hidden className={cn("inline-grid size-8 shrink-0 place-items-center rounded-md font-mono text-[11px] font-bold", s.className, className)}>
      {s.label}
    </span>
  );
}
