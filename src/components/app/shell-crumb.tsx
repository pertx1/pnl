"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { ProjectAvatar } from "@/components/dashboard/project-dot";
import { PROJECT_NAV } from "./nav-config";
import { useCurrentProject, type ShellProject } from "./project-context";

/**
 * Migas de pan del proyecto (escritorio): «[avatar] Proyecto › Sección». En móvil el proyecto ya está en la cabecera.
 * Solo dentro de un proyecto: deja claro en qué proyecto estás antes de crear o aprobar nada.
 */
export function ShellCrumb({ projects, recentProjectIds }: { projects: ShellProject[]; recentProjectIds: string[] }) {
  const t = useTranslations("nav");
  const ts = useTranslations("shell");
  const { pathname, current, inProject } = useCurrentProject(projects, recentProjectIds);
  if (!inProject || !current) return null;

  const base = `/app/p/${current.id}`;
  const section = pathname.slice(base.length).split("/")[1] ?? "";
  const item = PROJECT_NAV.flatMap((g) => g.items).find((it) => it.path === section);
  const sectionLabel = section === "posts" ? ts("nav.post") : item ? t(item.label) : null;

  return (
    <nav aria-label={ts("crumb.label")} className="mx-auto mb-5 hidden w-full max-w-[1360px] md:block">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
        <li className="min-w-0">
          <Link
            href={base}
            aria-current={sectionLabel ? undefined : "page"}
            className="inline-flex min-w-0 items-center gap-2 rounded-full py-1 pr-2.5 pl-1 font-medium text-foreground hover:bg-accent"
          >
            <ProjectAvatar id={current.id} name={current.name} className="size-6 rounded-lg text-[10px]" />
            <span className="truncate">{current.name}</span>
          </Link>
        </li>
        {sectionLabel && (
          <>
            <li aria-hidden>
              <ChevronRight className="size-4" />
            </li>
            <li aria-current="page" className="truncate">
              {sectionLabel}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
