import Link from "next/link";
import { Clapperboard, ImageIcon, Sparkles, Type } from "lucide-react";
import { PlatformIcon } from "@/components/social/platform-icon";
import { cn } from "@/lib/utils";
import { LocalTime } from "./local-time";

/** Portada firmada de una publicación (ver `getPostCovers`). Se repite el tipo para poder usarla en cliente. */
export type ThumbCover = { url: string; kind: "image" | "video"; poster: string | null };

export const STATUS_COLOR: Record<string, string> = {
  draft: "var(--muted-foreground)",
  pending_approval: "var(--warning)",
  approved: "var(--info)",
  scheduled: "var(--primary-ink)",
  scheduled_on_platform: "var(--info)",
  awaiting_user_publish: "var(--warning)",
  publishing: "var(--info)",
  published: "var(--success)",
  failed: "var(--destructive)",
  cancelled: "var(--muted-foreground)",
};

/**
 * Miniatura del medio de una publicación, como en la galería del móvil. Decorativa (el enlace que la envuelve lleva el texto).
 * Imagen → <img>; vídeo → póster si existe o primer fotograma con <video preload="metadata">; sin medio → icono.
 */
export function PostThumb({ cover, className, textOnly }: { cover?: ThumbCover | null; className?: string; textOnly?: boolean }) {
  const still = cover ? (cover.kind === "image" ? cover.url : cover.poster) : null;
  return (
    <div aria-hidden className={cn("relative overflow-hidden bg-muted", className)}>
      {still ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={still} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      ) : cover?.kind === "video" ? (
        <video src={`${cover.url}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} className="absolute inset-0 size-full object-cover" />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-muted-foreground">
          {textOnly ? <Type className="size-1/4 max-h-8 max-w-8" strokeWidth={1.5} /> : <ImageIcon className="size-1/4 max-h-8 max-w-8" strokeWidth={1.5} />}
        </span>
      )}
      {cover?.kind === "video" && (
        <span className="absolute right-1.5 bottom-1.5 grid size-6 place-items-center rounded-full bg-background/85 text-foreground backdrop-blur">
          <Clapperboard className="size-3.5" strokeWidth={1.75} />
        </span>
      )}
    </div>
  );
}

/** Chip de estado legible sobre una imagen: fondo sólido del tema y punto de color. */
export function StatusChip({ status, label, className }: { status: string; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-semibold text-foreground backdrop-blur", className)}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[status] ?? "var(--muted-foreground)" }} />
      <span className="truncate">{label}</span>
    </span>
  );
}

export type PostCardData = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  platforms: string[];
  aiGenerated?: boolean;
  cover?: ThumbCover | null;
  /** Fecha programada (ISO): se muestra en la hora local del navegador. */
  whenIso?: string | null;
  projectName?: string;
};

/**
 * Tarjeta vertical 9:16 de una publicación (tira «Próximas publicaciones», calendario).
 * Sin hooks propios: sirve en componentes de servidor y de cliente (los textos llegan ya traducidos).
 */
export function PostCard({ post, statusLabel, aiLabel, className, draggable, onDragStart }: { post: PostCardData; statusLabel: string; aiLabel: string; className?: string; draggable?: boolean; onDragStart?: React.DragEventHandler<HTMLAnchorElement> }) {
  return (
    <Link
      href={`/app/p/${post.projectId}/posts/${post.id}`}
      draggable={draggable}
      onDragStart={onDragStart}
      className={cn("group/post lift relative block min-w-0 rounded-2xl border bg-card p-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}
    >
      <div className="relative">
        <PostThumb cover={post.cover} className="aspect-[9/16] rounded-xl" />
        <span className="absolute inset-x-1.5 top-1.5 flex items-start justify-between gap-1">
          <StatusChip status={post.status} label={statusLabel} />
        </span>
        <span className="absolute bottom-1.5 left-1.5 flex gap-1">
          {[...new Set(post.platforms)].map((pl) => (
            <PlatformIcon key={pl} platform={pl} label className="size-6 rounded-lg ring-2 ring-background" />
          ))}
        </span>
      </div>
      <div className="space-y-0.5 px-1 pt-2 pb-1">
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {post.whenIso && <LocalTime iso={post.whenIso} className="font-mono tabular-nums" />}
          {post.aiGenerated && (
            <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 text-[10px] font-medium">
              <Sparkles className="size-2.5 text-brand-amber-ink" aria-hidden />
              <span>{aiLabel}</span>
            </span>
          )}
        </p>
        <p className="line-clamp-2 text-sm leading-snug font-medium">{post.title}</p>
        {post.projectName && <p className="truncate text-xs text-muted-foreground">{post.projectName}</p>}
      </div>
    </Link>
  );
}
