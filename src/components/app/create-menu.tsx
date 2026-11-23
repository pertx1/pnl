"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FilePlus2, FolderPlus, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createHrefs, type NavIcon } from "./nav-config";

type Project = { id: string; name: string };

/**
 * Menú global "Crear". Con un proyecto abierto, las acciones van a ese proyecto;
 * sin proyecto, "Nueva publicación" y "Generar con IA" piden elegir uno (submenú).
 * Radix gestiona teclado (flechas, Enter, Escape) y devuelve el foco al botón al cerrar.
 */
export function CreateMenu({ projects, currentProject }: { projects: Project[]; currentProject?: Project }) {
  const t = useTranslations("nav");

  const projectAction = (key: "newPost" | "generate", icon: NavIcon, label: string) => {
    const Icon = icon;
    if (currentProject) {
      return (
        <DropdownMenuItem asChild>
          <Link href={createHrefs[key](currentProject.id)}>
            <Icon strokeWidth={1.5} aria-hidden />
            {label}
          </Link>
        </DropdownMenuItem>
      );
    }
    if (projects.length === 0) {
      return (
        <DropdownMenuItem disabled>
          <Icon strokeWidth={1.5} aria-hidden />
          {label}
        </DropdownMenuItem>
      );
    }
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Icon strokeWidth={1.5} aria-hidden />
          {label}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-72 max-w-56 overflow-y-auto">
          <DropdownMenuLabel>{t("chooseProject")}</DropdownMenuLabel>
          {projects.map((p) => (
            <DropdownMenuItem key={p.id} asChild>
              <Link href={createHrefs[key](p.id)} className="truncate">
                {p.name}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          <Plus aria-hidden />
          {t("create")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56">
        {currentProject && <DropdownMenuLabel className="truncate">{currentProject.name}</DropdownMenuLabel>}
        {projectAction("newPost", FilePlus2, t("newPost"))}
        {projectAction("generate", Sparkles, t("generateAI"))}
        {!currentProject && projects.length === 0 && (
          <p className="px-1.5 py-1 text-xs text-muted-foreground">{t("noProjectsYet")}</p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={createHrefs.newProject}>
            <FolderPlus strokeWidth={1.5} aria-hidden />
            {t("newProject")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
