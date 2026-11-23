/**
 * Opciones de render del Clipper (lógica pura, compartida cliente/servidor): formato de salida, encuadre y plantillas de
 * subtítulos. Traduce lo que elige el usuario a los parámetros REALES de las herramientas de fal.ai:
 *  - fal-ai/workflow-utilities/scale-video: width, height, mode (crop | pad), pad_color, codec, preset, crf.
 *    El recorte es SIEMPRE centrado (la herramienta no admite desplazamiento X/Y): por eso ofrecemos «encajar» (pad) para
 *    no cortar a quien habla fuera del centro.
 *  - fal-ai/workflow-utilities/auto-subtitle: font_name (Google Fonts), font_size, font_weight (normal|bold|black),
 *    font_color / highlight_color / stroke_color / background_color (solo colores con nombre), background_opacity,
 *    stroke_width, position (top|center|bottom), y_offset, words_per_subtitle, enable_animation.
 *    Documentación verificada en fal.ai el 2026-11-23. No admite emojis ni texto libre sobreimpreso.
 *
 * Ninguna de las dos herramientas tiene parámetros de marca de agua, y aquí no se añade ninguno (ver test «sin marca de agua»).
 */
import { z } from "zod";
import { NAMED_COLORS, nearestNamedColor } from "./segments";

export const CLIP_FORMATS = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
} as const;
export type ClipFormat = keyof typeof CLIP_FORMATS;
export const FORMAT_KEYS = Object.keys(CLIP_FORMATS) as ClipFormat[];

export const LAYOUTS = ["crop", "fit"] as const;
/** Colores admitidos por scale-video en modo pad. */
export const PAD_COLORS = ["black", "white", "gray", "red", "green", "blue"] as const;
export const SUBTITLE_STYLES = ["karaoke", "box", "caps", "minimal", "word"] as const;
export const SUBTITLE_POSITIONS = ["top", "center", "bottom"] as const;
export const SUBTITLE_SIZES = ["s", "m", "l"] as const;
export const TEXT_COLORS = ["white", "yellow", "black"] as const;

export type SubtitleStyle = (typeof SUBTITLE_STYLES)[number];
export type NamedColor = keyof typeof NAMED_COLORS;

const NAMED = Object.keys(NAMED_COLORS) as [string, ...string[]];

export const renderOptionsSchema = z.object({
  format: z.enum(FORMAT_KEYS as [ClipFormat, ...ClipFormat[]]),
  layout: z.enum(LAYOUTS),
  padColor: z.enum(PAD_COLORS),
  subtitles: z.boolean(),
  style: z.enum(SUBTITLE_STYLES),
  position: z.enum(SUBTITLE_POSITIONS),
  size: z.enum(SUBTITLE_SIZES),
  textColor: z.enum(TEXT_COLORS),
  /** Color de acento: un hex del brand kit (se convierte al color con nombre más cercano) o un nombre admitido. */
  accent: z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.enum(NAMED)]),
});
export type RenderOptions = z.infer<typeof renderOptionsSchema>;

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  format: "9:16",
  layout: "crop",
  padColor: "black",
  subtitles: true,
  style: "karaoke",
  position: "bottom",
  size: "m",
  textColor: "white",
  accent: "yellow",
};

/** Plantillas de subtítulos (aproximación honesta a los estilos tipo OpusClip con lo que permite auto-subtitle). */
export const STYLE_PRESETS: Record<
  SubtitleStyle,
  { font: string | null; weight: "normal" | "bold" | "black"; size: number; words: number; stroke: number; animation: boolean; karaoke: boolean; box: boolean }
> = {
  // Palabra a palabra: el bloque de 3 palabras y la que suena en el color de acento.
  karaoke: { font: null, weight: "black", size: 80, words: 3, stroke: 4, animation: true, karaoke: true, box: false },
  // Caja de color: frases de 2 palabras sobre una caja con el color de acento (la caja cubre la frase, no solo la palabra activa).
  box: { font: null, weight: "black", size: 72, words: 2, stroke: 0, animation: true, karaoke: false, box: true },
  // Mayúsculas grandes: Bebas Neue (Google Fonts, OFL) solo tiene mayúsculas → texto en mayúsculas sin tocar la transcripción.
  caps: { font: "Bebas Neue", weight: "normal", size: 125, words: 2, stroke: 5, animation: true, karaoke: true, box: false },
  // Minimalista: frase completa, fina, sin resaltado ni animación.
  minimal: { font: null, weight: "bold", size: 56, words: 6, stroke: 2, animation: false, karaoke: false, box: false },
  // Una palabra: una sola palabra grande en el color de acento, con rebote.
  word: { font: null, weight: "black", size: 110, words: 1, stroke: 5, animation: true, karaoke: true, box: false },
};

const SIZE_FACTOR = { s: 0.8, m: 1, l: 1.2 } as const;

/** Colores claros: sobre ellos el texto va en negro. */
const LIGHT = new Set(["white", "yellow", "cyan", "pink", "orange"]);

export function accentToNamed(accent: string): NamedColor {
  if (accent in NAMED_COLORS) return accent as NamedColor;
  return (nearestNamedColor(accent) ?? "yellow") as NamedColor;
}

export type ResolvedRender = RenderOptions & { accentNamed: NamedColor; fontName: string };

/** Resuelve colores y fuente (la del brand kit si el estilo no impone una). */
export function resolveRenderOptions(o: RenderOptions, brandFont?: string | null): ResolvedRender {
  const clean = (brandFont ?? "").replace(/[^A-Za-z0-9 ]/g, "").trim().slice(0, 60);
  const preset = STYLE_PRESETS[o.style];
  let accentNamed = accentToNamed(o.accent);
  // El acento no puede coincidir con el texto (no se vería el resaltado): se usa amarillo, o blanco si el texto es amarillo.
  if (preset.karaoke && accentNamed === o.textColor) accentNamed = o.textColor === "yellow" ? "white" : "yellow";
  return { ...o, accentNamed, fontName: preset.font ?? (clean || "Montserrat") };
}

/** Parámetros de fal-ai/workflow-utilities/scale-video. */
export function scaleInput(videoUrl: string, o: Pick<RenderOptions, "format" | "layout" | "padColor">) {
  const { width, height } = CLIP_FORMATS[o.format];
  return {
    video_url: videoUrl,
    width,
    height,
    mode: o.layout === "fit" ? "pad" : "crop",
    ...(o.layout === "fit" ? { pad_color: o.padColor } : {}),
    codec: "libx264",
    preset: "fast",
    crf: 20,
  };
}

/** Desplazamiento vertical: por encima de la interfaz de TikTok/Reels en vertical; margen pequeño en el resto. */
export function subtitleYOffset(format: ClipFormat, position: RenderOptions["position"]) {
  if (position === "center") return 0;
  const vertical = format === "9:16";
  return position === "bottom" ? (vertical ? -260 : -70) : vertical ? 220 : 60;
}

export function safeLanguage(language: string | null | undefined) {
  return language && /^[a-z]{2,3}$/.test(language) ? language : "es";
}

/** Parámetros de fal-ai/workflow-utilities/auto-subtitle para una plantilla. */
export function subtitleInput(videoUrl: string, r: ResolvedRender, language: string | null | undefined) {
  const p = STYLE_PRESETS[r.style];
  const text: NamedColor = p.box ? (LIGHT.has(r.accentNamed) ? "black" : "white") : r.style === "word" ? r.accentNamed : r.textColor;
  const highlight: NamedColor = p.karaoke ? r.accentNamed : text;
  return {
    video_url: videoUrl,
    language: safeLanguage(language),
    font_name: r.fontName,
    font_size: Math.round(p.size * SIZE_FACTOR[r.size]),
    font_weight: p.weight,
    font_color: text,
    highlight_color: highlight,
    stroke_width: p.stroke,
    stroke_color: text === "black" ? "white" : "black",
    background_color: p.box ? r.accentNamed : "none",
    ...(p.box ? { background_opacity: 0.9 } : {}),
    position: r.position,
    y_offset: subtitleYOffset(r.format, r.position),
    words_per_subtitle: p.words,
    enable_animation: p.animation,
  };
}

/** Color CSS de un color con nombre (para la vista previa). */
export function namedCss(name: string) {
  const rgb = NAMED_COLORS[name] ?? NAMED_COLORS.white;
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
}

/**
 * Zona del vídeo original que se conserva (fracciones 0–1) en modo recorte centrado. En modo encajar se conserva todo.
 * Sirve para la vista previa: el usuario ve si quien habla queda dentro antes de pagar.
 */
export function cropWindow(srcW: number, srcH: number, format: ClipFormat, layout: RenderOptions["layout"]) {
  if (layout === "fit" || !(srcW > 0) || !(srcH > 0)) return { x: 0, y: 0, w: 1, h: 1 };
  const target = CLIP_FORMATS[format].width / CLIP_FORMATS[format].height;
  const src = srcW / srcH;
  if (src > target) {
    const w = target / src;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  const h = src / target;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

/** Lee opciones guardadas (o antiguas) con valores por defecto seguros. */
export function parseRenderOptions(raw: unknown): RenderOptions {
  const parsed = renderOptionsSchema.partial().safeParse(raw ?? {});
  return { ...DEFAULT_RENDER_OPTIONS, ...(parsed.success ? parsed.data : {}) };
}
