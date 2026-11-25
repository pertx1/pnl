"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState, useTransition } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Check, ChevronsUpDown, FolderKanban, FolderPlus, Search } from "lucide-react";
import { ProjectAvatar } from "@/components/dashboard/project-dot";
import { switchWorkspace } from "@/app/app/actions";
import type { WorkspaceSummary } from "@/lib/server/dal";
import { sameSectionHref } from "@/lib/projects/identity";
import { cn } from "@/lib/utils";
import { matchesQuery } from "./nav-config";
import type { ShellProject } from "./project-context";

/** Punto de estado: ámbar si hay algo por aprobar o sin leer; el texto accesible lo explica. */
export function ProjectStatusDot({ project, className }: { project: ShellProject; className?: string }) {
  const t = useTranslations("shell.switcher");
  const attention = project.pending + project.unread > 0;
  return (
    <span className={cn("inline-flex items-center", className)}>
      <span aria-hidden className={cn("size-2 rounded-full", attention ? "bg-warning" : "bg-success/70")} />
      <span className="sr-only">{attention ? t("attention") : t("allClear")}</span>
    </span>
  );
}

/** Detalle corto bajo el nombre: «2 por aprobar · 1 sin leer». */
function useProjectDetail() {
  const tn = useTranslations("shell.nav");
  const ts = useTranslations("shell.switcher");
  return (p: ShellProject) => {
    const parts = [p.pending ? tn("pendingBadge", { count: p.pending }) : null, p.unread ? tn("unreadBadge", { count: p.unread }) : null].filter(Boolean);
    return parts.length ? parts.join(" · ") : ts("allClear");
  };
}

/** Botón que abre el selector (barra lateral en escritorio, cabecera en móvil). */
export function ProjectSwitcherTrigger({ current, onOpen, compact = false }: { current?: ShellProject; onOpen: () => void; compact?: boolean }) {
  const t = useTranslations("shell.switcher");
  const detail = useProjectDetail();
  if (!current) {
    return (
      <Link
        href="/app/projects/new"
        className={cn(
          "flex min-h-11 items-center gap-2.5 rounded-2xl border border-dashed px-3 text-sm font-medium text-muted-foreground hover:border-border-strong hover:text-foreground",
          compact && "min-w-0 flex-1",
        )}
      >
        <FolderPlus className="size-5" strokeWidth={1.75} aria-hidden />
        <span className="truncate">{t("triggerEmpty")}</span>
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={t("trigger", { name: current.name })}
      aria-keyshortcuts="g p"
      className={cn(
        "group flex min-w-0 items-center gap-2.5 rounded-2xl text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
        compact ? "min-h-11 flex-1 px-1.5 hover:bg-accent/60" : "w-full border bg-card p-2 pr-2.5 hover:border-border-strong hover:bg-accent/40",
      )}
    >
      <span className="relative">
        <ProjectAvatar id={current.id} name={current.name} className={compact ? "size-8 rounded-[10px] text-xs" : "size-10"} />
        <ProjectStatusDot project={current} className="absolute -right-0.5 -bottom-0.5 rounded-full bg-card p-[2px]" />
      </span>
      <span className="min-w-0 flex-1">
        {!compact && <span className="block text-[11px] font-medium text-muted-foreground">{t("label")}</span>}
        <span className="block truncate font-heading text-[15px] leading-tight font-semibold">{current.name}</span>
        {!compact && <span className="block truncate text-xs text-muted-foreground">{detail(current)}</span>}
      </span>
      <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

/**
 * Selector de proyectos: buscar, recientes y todos. Diálogo modal (foco atrapado, Escape cierra y devuelve el foco).
 * En móvil es una hoja inferior (a mano con el pulgar); en escritorio, un panel junto a la barra lateral.
 * Patrón combobox + listbox (ARIA 1.2), como la paleta de comandos.
 * Al elegir, se mantiene la sección: del Calendario de A al Calendario de B.
 */
export function ProjectSwitcher({
  open,
  onOpenChange,
  projects,
  recentIds,
  current,
  pathname,
  workspace,
  workspaces,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ShellProject[];
  recentIds: string[];
  current?: ShellProject;
  pathname: string;
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
}) {
  const t = useTranslations("shell.switcher");
  const router = useRouter();
  const uid = useId();
  const detail = useProjectDetail();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const numberOf = useMemo(() => new Map(projects.map((p, i) => [p.id, i + 1])), [projects]);
  const groups = useMemo(() => {
    if (query.trim()) return [{ name: null as string | null, items: projects.filter((p) => matchesQuery(p.name, query)) }];
    const recent = recentIds.map((id) => projects.find((p) => p.id === id)).filter((p): p is ShellProject => !!p);
    const out: { name: string | null; items: ShellProject[] }[] = [];
    if (recent.length > 1 && projects.length > 4) out.push({ name: t("recent"), items: recent });
    out.push({ name: out.length ? t("all") : null, items: projects });
    return out;
  }, [projects, recentIds, query, t]);
  const flat = groups.flatMap((g) => g.items);
  // Índice global de la primera opción de cada grupo (para aria-activedescendant).
  const starts = groups.map((_, gi) => groups.slice(0, gi).reduce((a, g) => a + g.items.length, 0));
  const activeIndex = flat.length === 0 ? -1 : Math.min(active, flat.length - 1);
  const optionId = (i: number) => `${uid}-o-${i}`;

  const choose = (p: ShellProject | undefined) => {
    if (!p) return;
    onOpenChange(false);
    router.push(sameSectionHref(pathname, window.location.search, p.id));
  };

  const move = (delta: number) => {
    if (!flat.length) return;
    const next = (activeIndex + delta + flat.length) % flat.length;
    setActive(next);
    document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(flat[activeIndex]);
    }
  };

  const listId = `${uid}-list`;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setQuery("");
          setActive(0);
        }
        onOpenChange(next);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-open:animate-in data-open:fade-in-0 md:bg-black/20" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const currentIndex = current ? Math.max(0, projects.findIndex((p) => p.id === current.id)) : 0;
            setQuery("");
            setActive(groups.length > 1 ? 0 : currentIndex);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className={cn(
            "animate-pop fixed z-50 flex flex-col overflow-hidden border bg-popover text-popover-foreground shadow-2xl outline-none",
            // Móvil: hoja inferior, a mano con el pulgar.
            "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-3xl pb-[env(safe-area-inset-bottom)]",
            // Escritorio: panel junto al botón de la barra lateral.
            "md:inset-x-auto md:top-4 md:bottom-auto md:left-4 md:max-h-[min(36rem,calc(100dvh-2rem))] md:w-[22rem] md:rounded-3xl md:pb-0",
          )}
        >
          <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-border-strong md:hidden" />
          <div className="px-4 pt-3 pb-2">
            <DialogPrimitive.Title className="font-heading text-lg font-semibold">{t("title")}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{t("description")}</DialogPrimitive.Description>
          </div>
          <div className="mx-3 flex items-center gap-2 rounded-xl border border-input px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
              aria-label={t("search")}
              placeholder={t("search")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
            />
          </div>

          <div id={listId} role="listbox" aria-label={t("title")} className="min-h-0 flex-1 overflow-y-auto p-2">
            {groups.map((g, gi) => (
              <div key={gi} role="group" aria-label={g.name ?? t("all")} className="py-1">
                {g.name && (
                  <p aria-hidden className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                    {g.name}
                  </p>
                )}
                {g.items.map((p, j) => {
                  const i = starts[gi] + j;
                  const selected = i === activeIndex;
                  const isCurrent = p.id === current?.id;
                  const n = numberOf.get(p.id) ?? 0;
                  return (
                    <div
                      key={`${gi}-${p.id}`}
                      id={optionId(i)}
                      role="option"
                      aria-selected={selected}
                      aria-current={isCurrent ? "true" : undefined}
                      onMouseMove={() => {
                        if (!selected) setActive(i);
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(p)}
                      className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-2 py-1.5", selected && "bg-accent")}
                    >
                      <span className="relative">
                        <ProjectAvatar id={p.id} name={p.name} />
                        <ProjectStatusDot project={p} className="absolute -right-0.5 -bottom-0.5 rounded-full bg-popover p-[2px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{p.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{detail(p)}</span>
                      </span>
                      {isCurrent ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink">
                          <Check className="size-4" aria-hidden />
                          <span className="sr-only md:not-sr-only">{t("current")}</span>
                        </span>
                      ) : (
                        n > 0 && n < 10 && <kbd className="hidden rounded-md border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:inline">Alt {n}</kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {flat.length === 0 && (
              <p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t("empty", { query })}
              </p>
            )}
          </div>

          <div className="space-y-2 border-t p-3">
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/app/projects/new"
                onClick={() => onOpenChange(false)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border-strong px-3 text-sm font-medium hover:bg-accent"
              >
                <FolderPlus className="size-4" aria-hidden /> {t("newProject")}
              </Link>
              <Link
                href="/app/projects"
                onClick={() => onOpenChange(false)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium hover:bg-accent"
              >
                <FolderKanban className="size-4" aria-hidden /> {t("manage")}
              </Link>
            </div>
            {workspaces.length > 1 && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="shrink-0">{t("workspace")}</span>
                <select
                  className="h-10 min-w-0 flex-1 truncate rounded-lg border border-input bg-background px-2.5 text-sm text-foreground"
                  value={workspace.id}
                  disabled={pending}
                  onChange={(e) => {
                    const id = e.target.value;
                    start(() => switchWorkspace(id));
                  }}
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="hidden text-[11px] text-muted-foreground md:block">{t("hint")}</p>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
