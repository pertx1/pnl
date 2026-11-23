"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { CalendarClock, CornerDownLeft, FilePlus2, FolderKanban, FolderPlus, LayoutDashboard, LayoutTemplate, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { GLOBAL_NAV, PROJECT_NAV, createHrefs, matchesQuery, type NavIcon } from "./nav-config";

type Project = { id: string; name: string };
type Command = { id: string; group: string; label: string; hint?: string; keywords?: string; href: string; icon: NavIcon };

const noopSubscribe = () => () => {};
/** ¿Mac/iOS? Solo en cliente (en servidor, "Ctrl"), sin setState en efectos. */
function useIsApple() {
  return useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent),
    () => false,
  );
}

/** Texto del atajo ("⌘ K" en Mac, "Ctrl K" en el resto). */
export function useShortcutLabel() {
  return useIsApple() ? "⌘ K" : "Ctrl K";
}

/**
 * Paleta de comandos (Ctrl+K / Cmd+K): salta a cualquier sección o acción de "Crear".
 * Patrón combobox + listbox (ARIA 1.2): el foco se queda en el campo y `aria-activedescendant` marca la opción.
 */
export function CommandPalette({
  open,
  onOpenChange,
  projects,
  currentProject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  currentProject?: Project;
}) {
  const t = useTranslations("nav");
  const router = useRouter();
  const uid = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  // Atajo global. Se escucha siempre (aunque la paleta esté cerrada).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuery("");
        setActive(0);
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];
    const gCreate = t("groupCreate");
    const gGo = t("palette.groupGo");
    const gProjects = t("palette.groupProjects");

    if (currentProject) {
      list.push(
        { id: "c-post", group: gCreate, label: t("newPost"), hint: currentProject.name, href: createHrefs.newPost(currentProject.id), icon: FilePlus2 },
        { id: "c-tpl", group: gCreate, label: t("fromTemplate"), hint: currentProject.name, keywords: t("templatesKeywords"), href: createHrefs.fromTemplate(currentProject.id), icon: LayoutTemplate },
        { id: "c-ai", group: gCreate, label: t("generateAI"), hint: currentProject.name, keywords: t("studio"), href: createHrefs.generate(currentProject.id), icon: Sparkles },
      );
    } else {
      for (const p of projects) {
        list.push(
          { id: `c-post-${p.id}`, group: gCreate, label: t("newPost"), hint: p.name, href: createHrefs.newPost(p.id), icon: FilePlus2 },
          { id: `c-tpl-${p.id}`, group: gCreate, label: t("fromTemplate"), hint: p.name, keywords: t("templatesKeywords"), href: createHrefs.fromTemplate(p.id), icon: LayoutTemplate },
          { id: `c-ai-${p.id}`, group: gCreate, label: t("generateAI"), hint: p.name, keywords: t("studio"), href: createHrefs.generate(p.id), icon: Sparkles },
        );
      }
    }
    list.push({ id: "c-agenda", group: gCreate, label: t("newAgendaBlock"), keywords: t("agenda"), href: createHrefs.agendaBlock, icon: CalendarClock });
    list.push({ id: "c-project", group: gCreate, label: t("newProject"), href: createHrefs.newProject, icon: FolderPlus });

    if (currentProject) {
      const base = `/app/p/${currentProject.id}`;
      list.push({ id: "go-dashboard", group: gGo, label: t("dashboard"), hint: currentProject.name, href: base, icon: LayoutDashboard });
      for (const group of PROJECT_NAV) {
        for (const it of group.items) {
          list.push({
            id: `go-${it.path}`,
            group: gGo,
            label: t(it.label),
            hint: currentProject.name,
            keywords: t(group.label),
            href: `${base}/${it.path}`,
            icon: it.icon,
          });
        }
      }
    }
    for (const it of GLOBAL_NAV) {
      list.push({ id: `go-${it.href}`, group: gGo, label: t(it.label), href: it.href, icon: it.icon });
    }
    for (const p of projects) {
      if (p.id === currentProject?.id) continue;
      list.push({ id: `p-${p.id}`, group: gProjects, label: p.name, keywords: t("project"), href: `/app/p/${p.id}`, icon: FolderKanban });
    }
    return list;
  }, [t, projects, currentProject]);

  const results = useMemo(
    () => commands.filter((c) => matchesQuery(`${c.label} ${c.hint ?? ""} ${c.keywords ?? ""} ${c.group}`, query)),
    [commands, query],
  );
  const activeIndex = results.length === 0 ? -1 : Math.min(active, results.length - 1);
  const optionId = (i: number) => `${uid}-opt-${i}`;

  const go = useCallback(
    (cmd: Command | undefined) => {
      if (!cmd) return;
      onOpenChange(false);
      router.push(cmd.href);
    },
    [onOpenChange, router],
  );

  const move = (delta: number) => {
    if (results.length === 0) return;
    const next = (activeIndex + delta + results.length) % results.length;
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
    } else if (e.key === "Home" && results.length) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End" && results.length) {
      e.preventDefault();
      setActive(results.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[activeIndex]);
    }
  };

  // Agrupa manteniendo el orden e índices globales (para aria-activedescendant).
  const groups: { name: string; items: { cmd: Command; index: number }[] }[] = [];
  results.forEach((cmd, index) => {
    const last = groups[groups.length - 1];
    if (last && last.name === cmd.group) last.items.push({ cmd, index });
    else groups.push({ name: cmd.group, items: [{ cmd, index }] });
  });

  const listId = `${uid}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Ventana modal: si otro componente (p. ej. un menú que se acaba de cerrar) se lleva el foco fuera,
  // lo devolvemos a la caja de búsqueda.
  useEffect(() => {
    if (!open) return;
    const onFocusIn = (e: FocusEvent) => {
      if (contentRef.current && !contentRef.current.contains(e.target as Node)) inputRef.current?.focus();
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [open]);

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
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          ref={contentRef}
          aria-modal="true"
          onOpenAutoFocus={(e) => {
            // Foco siempre en la caja de búsqueda (aunque otro menú intente devolver el foco a su botón).
            e.preventDefault();
            setQuery("");
            setActive(0);
            requestAnimationFrame(() => inputRef.current?.focus());
            // Segundo intento: un menú que se acaba de cerrar puede devolver el foco a su botón un instante después.

          }}
          className="fixed top-[10vh] left-1/2 z-50 flex max-h-[min(32rem,80vh)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 motion-reduce:animate-none"
        >
          <DialogPrimitive.Title className="sr-only">{t("palette.title")}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{t("palette.description")}</DialogPrimitive.Description>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <input
              ref={inputRef}
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
              aria-label={t("palette.title")}
              placeholder={t("palette.placeholder")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
            />
            <kbd className="hidden rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">Esc</kbd>
          </div>

          <div id={listId} role="listbox" aria-label={t("palette.results")} className="min-h-0 flex-1 overflow-y-auto p-1">
            {groups.map((g, gi) => (
              <div key={g.name} role="group" aria-labelledby={`${uid}-g-${gi}`} className="py-1">
                <p id={`${uid}-g-${gi}`} aria-hidden className="label-mono px-2 pb-1 !text-[10px]">
                  {g.name}
                </p>
                {g.items.map(({ cmd, index }) => {
                  const selected = index === activeIndex;
                  const Icon = cmd.icon;
                  return (
                    <div
                      key={cmd.id}
                      id={optionId(index)}
                      role="option"
                      aria-selected={selected}
                      onMouseMove={() => {
                        if (!selected) setActive(index);
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(cmd)}
                      className={cn(
                        "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm",
                        selected ? "bg-accent text-foreground" : "text-muted-foreground",
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", selected && "text-primary-ink")} strokeWidth={1.5} aria-hidden />
                      <span className="truncate">{cmd.label}</span>
                      {cmd.hint && <span className="ml-auto max-w-[45%] truncate text-xs text-muted-foreground">{cmd.hint}</span>}
                      {selected && <CornerDownLeft className={cn("size-3.5 shrink-0 text-muted-foreground", !cmd.hint && "ml-auto")} aria-hidden />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {results.length === 0 && (
            <p role="status" className="px-3 pb-8 pt-4 text-center text-sm text-muted-foreground">
              {t("palette.empty", { query })}
            </p>
          )}
          <p className="hidden border-t border-border px-3 py-2 text-xs text-muted-foreground sm:block">{t("palette.hint")}</p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
