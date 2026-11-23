/**
 * Estado final de una publicación a partir del estado de sus destinos (función pura).
 * Devuelve `null` si algún destino sigue en curso (aprobado, programado o publicándose): no se toca el post.
 * - Algún destino fallido → "failed".
 * - Todos publicados → "published".
 * - Publicados y/o programados en la propia plataforma (YouTube `publishAt`) → "scheduled_on_platform".
 */
export type SettledStatus = "published" | "failed" | "scheduled_on_platform";

const IN_FLIGHT = new Set(["approved", "scheduled", "publishing"]);

export function settledPostStatus(statuses: string[]): SettledStatus | null {
  if (!statuses.length || statuses.some((s) => IN_FLIGHT.has(s))) return null;
  if (statuses.every((s) => s === "published")) return "published";
  if (statuses.every((s) => s === "published" || s === "scheduled_on_platform")) return "scheduled_on_platform";
  return "failed";
}
