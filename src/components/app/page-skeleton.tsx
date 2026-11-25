import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto que se muestra al instante al navegar, mientras el servidor prepara la página. */
export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-9 w-56 rounded-xl" />
        <Skeleton className="h-11 w-44 rounded-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="aspect-[9/16] w-36 shrink-0 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
