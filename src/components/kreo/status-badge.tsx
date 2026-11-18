import { cn } from "@/lib/utils";

export type PostStatus = "draft" | "pending_approval" | "scheduled" | "published" | "error";

const styles: Record<PostStatus, { label: string; color: string }> = {
  draft: { label: "Borrador", color: "var(--muted-foreground)" },
  pending_approval: { label: "Pendiente de aprobación", color: "var(--warning)" },
  scheduled: { label: "Programado", color: "var(--primary)" },
  published: { label: "Publicado", color: "var(--success)" },
  error: { label: "Error", color: "var(--destructive)" },
};

/** Estado de una publicación. El texto lo traducirá i18n en la Fase 1. */
export function StatusBadge({ status, className }: { status: PostStatus; className?: string }) {
  const s = styles[status];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold", className)}
      style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 14%, transparent)` }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}
