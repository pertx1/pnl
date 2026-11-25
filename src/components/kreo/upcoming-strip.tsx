import Link from "next/link";
import { CalendarPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./empty-state";
import { PostCard, type PostCardData } from "./post-thumb";

/**
 * Tira «Próximas publicaciones»: tarjetas verticales 9:16 en un carrusel horizontal (como la galería del móvil).
 * Sin hooks (componente de servidor); los textos llegan traducidos.
 */
export function UpcomingStrip({
  id,
  title,
  posts,
  statusLabel,
  aiLabel,
  moreHref,
  moreLabel,
  newHref,
  newLabel,
  emptyText,
}: {
  id: string;
  title: string;
  posts: PostCardData[];
  statusLabel: (status: string) => string;
  aiLabel: string;
  moreHref?: string;
  moreLabel?: string;
  newHref?: string;
  newLabel?: string;
  emptyText: string;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="section-title">
          {title}
        </h2>
        {moreHref && moreLabel && (
          <Link href={moreHref} className="link inline-flex min-h-11 items-center text-sm sm:min-h-0">
            {moreLabel}
          </Link>
        )}
      </div>
      {posts.length === 0 ? (
        <EmptyState icon={CalendarPlus} tone="primary" body={emptyText} compact>
          {newHref && newLabel && (
            <Button asChild>
              <Link href={newHref}>
                <Plus /> {newLabel}
              </Link>
            </Button>
          )}
        </EmptyState>
      ) : (
        <ul className="scroller -mx-4 gap-3 px-4 pb-2 sm:mx-0 sm:px-0" aria-labelledby={id}>
          {posts.map((p) => (
            <li key={p.id} className="w-36 sm:w-44">
              <PostCard post={p} statusLabel={statusLabel(p.status)} aiLabel={aiLabel} className="h-full" />
            </li>
          ))}
          {newHref && newLabel && (
            <li className="w-36 sm:w-44">
              <Link
                href={newHref}
                className="lift flex aspect-[9/16] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-3 text-center text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span aria-hidden className="grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary-ink">
                  <Plus className="size-6" />
                </span>
                {newLabel}
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
