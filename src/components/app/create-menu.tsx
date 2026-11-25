"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarClock, FilePlus2, FolderPlus, LayoutTemplate, Plus, Scissors, Sparkles } from "lucide-react";
import { IconBubble, type BubbleTone } from "@/components/kreo/icon-bubble";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { createHrefs, type NavIcon } from "./nav-config";

type Project = { id: string; name: string };

/**
 * Menú global «Crear», siempre a mano (barra lateral en escritorio, botón central en móvil).
 * Las acciones van al proyecto actual (el de la URL o el último usado), que se indica arriba del menú.
 * Radix gestiona el teclado (flechas, Enter, Escape) y devuelve el foco al botón al cerrar.
 */
export function CreateMenu({ currentProject, variant = "sidebar" }: { currentProject?: Project; variant?: "sidebar" | "fab" }) {
  const t = useTranslations("shell.create");

  const item = (href: string | null, icon: NavIcon, tone: BubbleTone, label: string, hint: string) => {
    const body = (
      <>
        <IconBubble icon={icon} tone={tone} size="md" />
        <span className="min-w-0">
          <span className="block font-medium">{label}</span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
      </>
    );
    if (!href) {
      return (
        <DropdownMenuItem disabled className="min-h-14 gap-3 rounded-xl">
          {body}
        </DropdownMenuItem>
      );
    }
    return (
      <DropdownMenuItem asChild className="min-h-14 gap-3 rounded-xl">
        <Link href={href}>{body}</Link>
      </DropdownMenuItem>
    );
  };
  const pid = currentProject?.id;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "fab" ? (
          <button
            type="button"
            aria-label={t("button")}
            className="flex min-h-14 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-foreground outline-none focus-visible:[&>span]:ring-3 focus-visible:[&>span]:ring-ring/50"
          >
            <span aria-hidden className="-mt-6 grid size-14 place-items-center rounded-full bg-foreground text-background shadow-lg ring-4 ring-background transition-transform active:scale-95">
              <Plus className="size-7" strokeWidth={2.25} />
            </span>
            {t("button")}
          </button>
        ) : (
          <Button size="lg" className={cn("w-full justify-start bg-foreground text-background shadow-none hover:bg-foreground/90 hover:brightness-100")}>
            <Plus strokeWidth={2.25} aria-hidden />
            {t("button")}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={variant === "fab" ? "top" : "bottom"}
        align={variant === "fab" ? "center" : "start"}
        sideOffset={variant === "fab" ? 12 : 6}
        className="w-[min(20rem,calc(100vw-1.5rem))]"
      >
        <DropdownMenuLabel className="px-2.5 pt-1.5 pb-1">
          <span className="block font-heading text-base font-semibold text-foreground">{t("title")}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">{currentProject ? t("inProject", { name: currentProject.name }) : t("noProject")}</span>
        </DropdownMenuLabel>
        {item(pid ? createHrefs.newPost(pid) : null, FilePlus2, "primary", t("post"), t("postHint"))}
        {item(pid ? createHrefs.generate(pid) : null, Sparkles, "amber", t("ai"), t("aiHint"))}
        {item(pid ? createHrefs.clipper(pid) : null, Scissors, "info", t("clip"), t("clipHint"))}
        {item(createHrefs.agendaBlock, CalendarClock, "neutral", t("agenda"), t("agendaHint"))}
        {item(pid ? createHrefs.fromTemplate(pid) : null, LayoutTemplate, "neutral", t("template"), t("templateHint"))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="rounded-xl">
          <Link href={createHrefs.newProject}>
            <FolderPlus strokeWidth={1.75} aria-hidden />
            {t("project")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
