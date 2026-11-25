"use client";

import { usePathname } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";
import { parseRecentProjects, pushRecentProject, RECENT_PROJECTS_COOKIE } from "@/lib/projects/identity";

/** Proyecto tal como lo ve la barra lateral: nombre y contadores (por aprobar, sin leer). */
export type ShellProject = { id: string; name: string; pending: number; unread: number };

// Pequeño almacén externo para la cookie de recientes: se avisa a los suscriptores al escribirla.
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function readCookie(): string {
  const prefix = `${RECENT_PROJECTS_COOKIE}=`;
  return document.cookie.split("; ").find((c) => c.startsWith(prefix))?.slice(prefix.length) ?? "";
}

/**
 * Guarda el proyecto como el más reciente (preferencia de interfaz, solo en este navegador, 1 año).
 * Sirve para abrir el último proyecto usado y ordenar «Recientes» en el selector.
 */
export function rememberProject(id: string) {
  const next = pushRecentProject(parseRecentProjects(readCookie()), id);
  const value = encodeURIComponent(next.join(","));
  if (value === readCookie()) return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${RECENT_PROJECTS_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  listeners.forEach((l) => l());
}

/** Recientes: en el servidor (y al hidratar) los de la petición; después, los de la cookie al momento. */
export function useRecentProjectIds(serverRecent: string[]): string[] {
  const raw = useSyncExternalStore(subscribe, readCookie, () => null);
  return useMemo(() => (raw === null ? serverRecent : parseRecentProjects(raw)), [raw, serverRecent]);
}

/**
 * Proyecto actual: el de la URL; fuera de un proyecto, el último usado (o el primero).
 * Así Calendario, Bandeja y Estudio están siempre a un clic, también desde el Inicio.
 */
export function useCurrentProject(projects: ShellProject[], serverRecent: string[]) {
  const pathname = usePathname();
  const recent = useRecentProjectIds(serverRecent);
  const urlId = pathname.match(/^\/app\/p\/([0-9a-f-]{36})/i)?.[1];
  const urlProject = projects.find((p) => p.id === urlId);
  const current = urlProject ?? projects.find((p) => p.id === recent.find((r) => projects.some((p) => p.id === r))) ?? projects[0];
  return { pathname, current, inProject: !!urlProject, recent };
}
