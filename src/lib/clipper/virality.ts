/**
 * Puntuación de viralidad del Clipper (lógica pura, compartida cliente/servidor).
 *
 * La IA puntúa cada momento en cuatro ejes (0–100) y el total se calcula AQUÍ con pesos fijos, para que sea coherente y
 * explicable (no depende de que el modelo sume bien). Es potencial RELATIVO dentro del vídeo, no una predicción de
 * visualizaciones: así se muestra en la interfaz (sección 0: no prometer resultados).
 *  - hook (gancho): ¿los primeros 3 s obligan a seguir mirando?
 *  - pacing (ritmo): densidad de ideas, sin silencios ni rodeos.
 *  - value (valor): aprendizaje, emoción o humor que deja al espectador.
 *  - trend (tendencia): encaje con formatos y temas que suelen funcionar en vídeo corto. Sin datos en tiempo real.
 */
export const VIRALITY_AXES = ["hook", "pacing", "value", "trend"] as const;
export type ViralityAxis = (typeof VIRALITY_AXES)[number];
export type ViralityBreakdown = Record<ViralityAxis, number>;

export const VIRALITY_WEIGHTS: ViralityBreakdown = { hook: 0.35, pacing: 0.2, value: 0.3, trend: 0.15 };

const clamp = (n: unknown) => {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(0, Math.min(100, Math.round(x))) : 0;
};

/** Normaliza un desglose (valores 0–100 enteros; lo que falte cuenta 0). */
export function normalizeBreakdown(raw: Partial<Record<ViralityAxis, unknown>> | null | undefined): ViralityBreakdown {
  return { hook: clamp(raw?.hook), pacing: clamp(raw?.pacing), value: clamp(raw?.value), trend: clamp(raw?.trend) };
}

/** Total 0–100 ponderado. */
export function viralityScore(b: ViralityBreakdown) {
  const total = VIRALITY_AXES.reduce((sum, k) => sum + b[k] * VIRALITY_WEIGHTS[k], 0);
  return Math.max(0, Math.min(100, Math.round(total)));
}

/** ¿El desglose guardado tiene datos? (los momentos antiguos solo tienen el total). */
export function hasBreakdown(raw: unknown): raw is ViralityBreakdown {
  if (!raw || typeof raw !== "object") return false;
  return VIRALITY_AXES.every((k) => typeof (raw as Record<string, unknown>)[k] === "number");
}

/** Nivel para la insignia (colores de la interfaz). */
export function viralityTier(score: number): "high" | "mid" | "low" {
  return score >= 75 ? "high" : score >= 50 ? "mid" : "low";
}
