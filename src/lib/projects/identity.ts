/**
 * Identidad visual de un proyecto (sin columna en la base de datos): color y avatar derivados de forma
 * estable del id, para que el mismo proyecto tenga siempre el mismo color en la barra lateral, el Inicio,
 * la agenda y el selector. Puro (sirve en servidor y en cliente).
 */

/** Número de colores de proyecto (series de gráficas, ver docs/brand.md). */
export const PROJECT_COLOR_COUNT = 5;

/** Índice de color estable a partir del id (FNV-1a de 32 bits). */
export function projectColorIndex(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % PROJECT_COLOR_COUNT;
}

/** Iniciales del proyecto (1-2 letras): «Pertx Studio» → «PS», «akerra» → «AK». */
export function projectInitials(name: string): string {
  const words = name
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "·";
  const letters = words.length === 1 ? [...words[0]].slice(0, 2) : [[...words[0]][0], [...words[1]][0]];
  return letters.join("").toLocaleUpperCase();
}

/** Ruta equivalente en otro proyecto: si estás en el Calendario de A, vas al Calendario de B. */
export function sameSectionHref(pathname: string, search: string, targetProjectId: string): string {
  const m = pathname.match(/^\/app\/p\/[0-9a-f-]{36}(\/.*)?$/i);
  const base = `/app/p/${targetProjectId}`;
  if (!m) return base;
  const rest = m[1] ?? "";
  const [, section = "", sub = ""] = rest.split("/");
  if (!section) return base;
  // El editor de una publicación concreta no existe en otro proyecto: «nueva» se mantiene, el resto va al Calendario.
  if (section === "posts") return sub === "new" ? `${base}/posts/new` : `${base}/calendar`;
  // Solo se conservan los parámetros de vista del calendario (no filtros ni ids de otro proyecto).
  if (section === "calendar") {
    const params = new URLSearchParams(search);
    const keep = new URLSearchParams();
    for (const k of ["view", "d"]) {
      const v = params.get(k);
      if (v) keep.set(k, v);
    }
    const qs = keep.toString();
    return `${base}/calendar${qs ? `?${qs}` : ""}`;
  }
  return `${base}/${section}`;
}

/** Cookie con los proyectos recientes (ids separados por comas, el primero es el último usado). Preferencia de interfaz. */
export const RECENT_PROJECTS_COOKIE = "kreo_recent_projects";
export const RECENT_PROJECTS_MAX = 5;

const UUID = /^[0-9a-f-]{36}$/i;

export function parseRecentProjects(value: string | undefined | null): string[] {
  if (!value) return [];
  let raw = value;
  try {
    raw = decodeURIComponent(value);
  } catch {
    return [];
  }
  return [...new Set(raw.split(",").filter((x) => UUID.test(x)))].slice(0, RECENT_PROJECTS_MAX);
}

export function pushRecentProject(list: string[], id: string): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, RECENT_PROJECTS_MAX);
}
