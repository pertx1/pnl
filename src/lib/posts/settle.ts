/**
 * Estado final de una publicación a partir del estado de sus destinos (función pura).
 * Devuelve `null` si algún destino sigue en curso (aprobado, programado o publicándose): no se toca el post.
 * - Algún destino fallido (o cualquier otro estado) → "failed".
 * - Todos publicados → "published".
 * - Alguno entregado a TikTok y pendiente de que el creador lo termine (borradores o subida a mano)
 *   → "awaiting_user_publish" (necesita una acción de la persona; tiene prioridad sobre lo programado en la red).
 * - Publicados y/o programados en la propia plataforma (YouTube `publishAt`) → "scheduled_on_platform".
 */
export type SettledStatus = "published" | "failed" | "scheduled_on_platform" | "awaiting_user_publish";

const IN_FLIGHT = new Set(["approved", "scheduled", "publishing"]);
const DONE = new Set(["published", "scheduled_on_platform", "awaiting_user_publish"]);

export function settledPostStatus(statuses: string[]): SettledStatus | null {
  if (!statuses.length || statuses.some((s) => IN_FLIGHT.has(s))) return null;
  if (statuses.every((s) => s === "published")) return "published";
  if (!statuses.every((s) => DONE.has(s))) return "failed";
  if (statuses.includes("awaiting_user_publish")) return "awaiting_user_publish";
  return "scheduled_on_platform";
}
