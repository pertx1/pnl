import { cn } from "@/lib/utils";

export type PostStatus = "draft" | "pending_approval" | "approved" | "scheduled" | "scheduled_on_platform" | "publishing" | "published" | "failed" | "cancelled" | "error";

const styles: Record<PostStatus, { label: string; color: string }> = {
  draft: { label: "Borrador", color: "var(--muted-foreground)" },
  pending_approval: { label: "Pendiente de aprobación", color: "var(--warning)" },
  scheduled: { label: "Programado", color: "var(--primary-ink)" },
  scheduled_on_platform: { label: "Programado en YouTube", color: "var(--info)" },
  published: { label: "Publicado", color: "var(--success)" },
  approved: { label: "Aprobado", color: "var(--info)" },
  publishing: { label: "Publicando", color: "var(--primary-ink)" },
  failed: { label: "Error", color: "var(--destructive)" },
  cancelled: { label: "Cancelado", color: "var(--muted-foreground)" },
  error: { label: "Error", color: "var(--destructive)" },
};

/** Estado de una publicación. Pasa `label` traducido (posts.status.*); si no, usa el texto en español. */
export function StatusBadge({ status, label, className }: { status: PostStatus; label?: string; className?: string }) {
  const s = styles[status];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold", className)}
      style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 14%, transparent)` }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: s.color }} />
      {label ?? s.label}
    </span>
  );
}
