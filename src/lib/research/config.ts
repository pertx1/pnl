import "server-only";

/** Configuración del módulo de investigación (sin clave → "pendiente de configurar", nunca rompe). */

/** YouTube Data API v3 con clave de API pública (solo datos públicos). */
export const youtubeApiKey = () => process.env.GOOGLE_API_KEY ?? "";
export const isYouTubeConfigured = () => Boolean(youtubeApiKey());

/**
 * Métricas derivadas de YouTube (outliers, múltiplo, frecuencia). Las Developer Policies III.E.4.h las prohíben
 * salvo a desarrolladores auditados con caso de uso de analítica (III.L). Desactivado hasta que Google lo apruebe.
 */
export const youtubeDerivedAllowed = () => process.env.YOUTUBE_DERIVED_METRICS_APPROVED === "true";

/** Meta Ad Library API: token de un usuario con identidad verificada en Meta. */
export const adLibraryToken = () => process.env.META_AD_LIBRARY_TOKEN ?? "";
export const isAdLibraryConfigured = () => Boolean(adLibraryToken());

export const graphVersion = () => process.env.META_GRAPH_VERSION ?? "v23.0";

/** Token de app para el oEmbed de Instagram/Facebook ("oEmbed Read"): APP_ID|CLIENT_TOKEN. */
export const metaOembedToken = () => {
  const id = process.env.META_APP_ID;
  const client = process.env.META_CLIENT_TOKEN;
  return id && client ? `${id}|${client}` : "";
};
