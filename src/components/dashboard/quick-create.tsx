"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, Plus } from "lucide-react";
import { createHrefs } from "@/components/app/nav-config";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ProjectDot } from "./project-dot";

/** «Nueva publicación» en cualquier proyecto: con uno solo va directo; con varios, se elige en un menú. */
export function QuickCreatePost({ projects }: { projects: { id: string; name: string }[] }) {
  const t = useTranslations("home");
  if (projects.length === 0) return null;
  if (projects.length === 1) {
    return (
      <Button asChild size="lg">
        <Link href={createHrefs.newPost(projects[0].id)}>
          <Plus /> {t("newPost")}
        </Link>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="lg">
          <Plus /> {t("newPost")} <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 min-w-56 overflow-y-auto">
        <DropdownMenuLabel>{t("chooseProject")}</DropdownMenuLabel>
        {projects.map((p) => (
          <DropdownMenuItem key={p.id} asChild className="min-h-9 pointer-coarse:min-h-11">
            <Link href={createHrefs.newPost(p.id)}>
              <ProjectDot id={p.id} />
              <span className="truncate">{p.name}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
