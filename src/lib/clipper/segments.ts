/**
 * Lógica pura del Clipper (sin dependencias de servidor): transcripción, segmentos, SRT, colores y créditos.
 */
import { normalizeBreakdown, viralityScore, type ViralityBreakdown } from "./virality";

export type TranscriptChunk = { s: number; e: number; t: string };
export type Segment = { start: number; end: number; title: string; hook: string; score: number; reason: string; breakdown?: ViralityBreakdown };

export const MIN_CLIP_S = 10;
export const MAX_CLIP_S = 90;
export const MAX_SEGMENTS = 8;
export const MAX_SOURCE_S = 60 * 60; // 60 min
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // límite del bucket project-media (plan gratis de Supabase)

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Salida de fal-ai/whisper (`chunks[].timestamp = [inicio, fin]`) → trozos limpios. */
export function normalizeTranscript(chunks: { timestamp?: (number | null)[]; text?: string }[] | undefined): TranscriptChunk[] {
  const out: TranscriptChunk[] = [];
  let lastEnd = 0;
  for (const c of chunks ?? []) {
    const s = Number(c.timestamp?.[0]);
    let e = Number(c.timestamp?.[1]);
    const t = (c.text ?? "").replace(/\s+/g, " ").trim();
    if (!Number.isFinite(s) || !t) continue;
    if (!Number.isFinite(e) || e <= s) e = s + Math.max(1, t.split(" ").length * 0.4); // Whisper a veces deja el último fin a null
    out.push({ s: r2(Math.max(s, 0)), e: r2(e), t: t.slice(0, 1000) });
    lastEnd = Math.max(lastEnd, e);
  }
  return out.sort((a, b) => a.s - b.s);
}

export function transcriptDuration(chunks: TranscriptChunk[]) {
  return chunks.reduce((m, c) => Math.max(m, c.e), 0);
}

/** Texto con marcas de tiempo para el agente (recortado a `maxChars`). */
export function transcriptForPrompt(chunks: TranscriptChunk[], maxChars = 60_000) {
  let out = "";
  for (const c of chunks) {
    const line = `[${c.s.toFixed(1)}-${c.e.toFixed(1)}] ${c.t}\n`;
    if (out.length + line.length > maxChars) break;
    out += line;
  }
  return out;
}

/**
 * Valida y ajusta los segmentos propuestos por la IA: dentro del vídeo, 10–90 s, alineados con el inicio/fin de
 * frases de la transcripción, sin solapes fuertes (se queda el de mayor puntuación) y máx. 8, ordenados por puntuación.
 * Si traen desglose de viralidad, la puntuación total se calcula con los pesos fijos de virality.ts.
 */
export function normalizeSegments(raw: Segment[], chunks: TranscriptChunk[], duration: number, opts = { min: MIN_CLIP_S, max: MAX_CLIP_S, count: MAX_SEGMENTS }): Segment[] {
  const snapStart = (t: number) => {
    const c = [...chunks].reverse().find((x) => x.s <= t + 0.5);
    return c ? c.s : t;
  };
  const snapEnd = (t: number) => {
    const c = chunks.find((x) => x.e >= t - 0.5);
    return c ? c.e : t;
  };
  const cleaned: Segment[] = [];
  for (const s of raw) {
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end)) continue;
    let start = Math.max(0, Math.min(s.start, duration));
    let end = Math.max(0, Math.min(s.end, duration));
    if (end <= start) continue;
    if (chunks.length) {
      start = snapStart(start);
      end = Math.min(snapEnd(end), duration || snapEnd(end));
    }
    if (end - start > opts.max) end = start + opts.max;
    if (end - start < opts.min) end = Math.min(duration || start + opts.min, start + opts.min);
    if (end - start < opts.min * 0.8) continue;
    const breakdown = s.breakdown ? normalizeBreakdown(s.breakdown) : undefined;
    cleaned.push({
      start: r2(start),
      end: r2(end),
      title: (s.title ?? "").trim().slice(0, 200) || "Clip",
      hook: (s.hook ?? "").trim().slice(0, 300),
      reason: (s.reason ?? "").trim().slice(0, 500),
      score: breakdown ? viralityScore(breakdown) : Math.max(0, Math.min(100, Math.round(Number(s.score) || 0))),
      ...(breakdown ? { breakdown } : {}),
    });
  }
  cleaned.sort((a, b) => b.score - a.score);
  const kept: Segment[] = [];
  for (const s of cleaned) {
    const overlaps = kept.some((k) => {
      const inter = Math.max(0, Math.min(k.end, s.end) - Math.max(k.start, s.start));
      return inter / Math.min(k.end - k.start, s.end - s.start) > 0.5;
    });
    if (!overlaps) kept.push(s);
    if (kept.length >= opts.count) break;
  }
  return kept;
}

export function srtTime(sec: number) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

/** Subtítulos .srt de un tramo (tiempos relativos al inicio del clip). */
export function toSrt(chunks: TranscriptChunk[], start = 0, end = Number.POSITIVE_INFINITY) {
  const lines: string[] = [];
  let i = 1;
  for (const c of chunks) {
    if (c.e <= start || c.s >= end) continue;
    const s = Math.max(c.s, start) - start;
    const e = Math.min(c.e, end) - start;
    if (e <= s) continue;
    lines.push(`${i++}\n${srtTime(s)} --> ${srtTime(e)}\n${c.t}\n`);
  }
  return lines.join("\n");
}

/** Palabra con tiempos (salida `words` de auto-subtitle, que transcribe con ElevenLabs a través de fal). */
type TimedWord = { text?: unknown; word?: unknown; start?: unknown; end?: unknown; type?: unknown };

/**
 * .srt a partir de palabras con tiempos (relativos al clip): líneas de hasta `maxWords` palabras o `maxSeconds`,
 * cortando también en pausas largas. Devuelve "" si no hay palabras válidas.
 */
export function wordsToSrt(words: unknown, maxWords = 7, maxSeconds = 3.5) {
  if (!Array.isArray(words)) return "";
  const list = (words as TimedWord[])
    .filter((w) => w && (w.type === undefined || w.type === "word"))
    .map((w) => ({ t: String(w.text ?? w.word ?? "").trim(), s: Number(w.start), e: Number(w.end) }))
    .filter((w) => w.t && Number.isFinite(w.s) && Number.isFinite(w.e) && w.e >= w.s);
  const cues: { s: number; e: number; t: string[] }[] = [];
  for (const w of list) {
    const cur = cues.at(-1);
    if (cur && cur.t.length < maxWords && w.e - cur.s <= maxSeconds && w.s - cur.e < 0.8) {
      cur.t.push(w.t);
      cur.e = w.e;
    } else cues.push({ s: w.s, e: w.e, t: [w.t] });
  }
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.s)} --> ${srtTime(Math.max(c.e, c.s + 0.3))}\n${c.t.join(" ")}\n`).join("\n");
}

/** Colores admitidos por fal-ai/workflow-utilities/auto-subtitle (solo nombres). */
export const NAMED_COLORS: Record<string, [number, number, number]> = {
  white: [255, 255, 255],
  black: [0, 0, 0],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  pink: [255, 192, 203],
  brown: [165, 42, 42],
  gray: [128, 128, 128],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Tono de referencia (grados) de cada color con nombre cromático. */
const HUES: [string, number][] = [
  ["red", 0],
  ["orange", 30],
  ["yellow", 58],
  ["green", 120],
  ["cyan", 185],
  ["blue", 220],
  ["purple", 275],
  ["magenta", 305],
  ["pink", 335],
  ["red", 360],
];

/**
 * Color con nombre más cercano a un hex. Se compara por TONO (HSL), que es lo que se percibe como "color de marca":
 * poco saturado → blanco/gris/negro según luminosidad; tonos cálidos muy oscuros → marrón; rosados claros → rosa.
 */
export function nearestNamedColor(hex: string): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (sat < 0.15 || d < 0.08) return l > 0.85 ? "white" : l < 0.2 ? "black" : "gray";
  let hue = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  if (hue < 0) hue += 360;
  if (hue >= 10 && hue <= 45 && l < 0.35) return "brown";
  let best = "red";
  let bestD = Infinity;
  for (const [name, h] of HUES) {
    const dist = Math.abs(hue - h);
    if (dist < bestD) {
      bestD = dist;
      best = name;
    }
  }
  if ((best === "red" || best === "magenta") && l > 0.75) return "pink";
  return best;
}

/**
 * Estilo de subtítulos a partir de la paleta del brand kit: la palabra activa (efecto karaoke) en el color de marca
 * más cercano que se lea bien sobre vídeo; texto blanco con borde negro (máxima legibilidad).
 */
export function subtitleStyle(brandColors: string[]) {
  const neutral = new Set(["white", "black", "gray"]);
  const highlight = brandColors.map(nearestNamedColor).find((c): c is string => Boolean(c && !neutral.has(c))) ?? "yellow";
  return { font_color: "white", highlight_color: highlight, stroke_color: "black" };
}

/**
 * Créditos (1 crédito ≈ 0,01 $; provisional, revisar con los precios reales del panel de fal/Anthropic):
 * - Análisis: transcripción Whisper (≈ 1 crédito/min, estimación conservadora de cómputo) + Claude (2 + 1 cada 5 min).
 * - Render de cada short: recorte + reencuadre 9:16 (≈ 7 créditos de cómputo a 0,001 $/s) + subtítulos (0,03 $/min).
 */
export function analysisCredits(durationS: number) {
  const min = Math.max(1, Math.ceil(durationS / 60));
  return min + 2 + Math.ceil(min / 5);
}

export function renderCredits(clipS: number, subtitles: boolean) {
  return 7 + (subtitles ? Math.max(1, Math.ceil((clipS / 60) * 3)) : 0);
}

/** Nombre de archivo seguro para mostrar como título. */
export function safeTitle(name: string) {
  return name.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[^\p{L}\p{N} _.-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Vídeo";
}
