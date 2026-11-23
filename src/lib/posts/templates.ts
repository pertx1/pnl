/**
 * Utilidades puras de plantillas de publicación y textos guardados (compartidas cliente/servidor).
 * Sin acceso a BD; tests en tests/unit/templates.test.ts.
 */
import { CAPTION_MAX, countHashtags, HASHTAG_MAX, type PlatformOptions } from "./rules";

/** Huecos tipo {tema} o {producto_2}: letras, números, "_" y "-", máx. 30 caracteres. */
const PLACEHOLDER_RE = /\{([\p{L}\p{N}_-]{1,30})\}/gu;

/** Nombres de los huecos de un texto, sin repetir y en orden de aparición. */
export function extractPlaceholders(...texts: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const text of texts) {
    for (const m of (text ?? "").matchAll(PLACEHOLDER_RE)) if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** Rellena los huecos con valor (no vacío). Los que no tengan valor se dejan tal cual para rellenarlos después. */
export function fillPlaceholders(text: string, values: Record<string, string | undefined>): string {
  return text.replace(PLACEHOLDER_RE, (whole, name: string) => {
    const v = values[name]?.trim();
    return v ? v : whole;
  });
}

/** Normaliza un hashtag escrito por el usuario ("café", "#Café ", "##x") → "#café". Devuelve null si no es válido. */
export function normalizeHashtag(raw: string): string | null {
  const body = raw.trim().replace(/^#+/, "");
  if (!body || body.length > 100 || !/^[\p{L}\p{N}_]+$/u.test(body)) return null;
  return `#${body}`;
}

/** Lista de hashtags a partir de un texto libre (separados por espacios, comas o saltos de línea), sin duplicados. */
export function parseHashtags(input: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of input.split(/[\s,;]+/)) {
    const tag = normalizeHashtag(part);
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      out.push(tag);
    }
  }
  return out;
}

/** Añade al final del texto los hashtags que aún no estén (en una línea aparte). */
export function appendHashtags(caption: string, tags: string[]): string {
  const present = new Set((caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.toLowerCase()));
  const missing = tags.filter((t) => !present.has(t.toLowerCase()));
  if (!missing.length) return caption;
  const base = caption.replace(/\s+$/, "");
  return base ? `${base}\n\n${missing.join(" ")}` : missing.join(" ");
}

/** Separa el bloque final de hashtags (última línea formada solo por hashtags) del resto del texto. */
export function splitTrailingHashtags(caption: string): { body: string; hashtags: string[] } {
  const trimmed = caption.replace(/\s+$/, "");
  const lines = trimmed.split("\n");
  const last = lines[lines.length - 1]?.trim() ?? "";
  if (!last || !/^(#[\p{L}\p{N}_]+[\s,]*)+$/u.test(last) || lines.length < 2) return { body: caption, hashtags: [] };
  return { body: lines.slice(0, -1).join("\n").replace(/\s+$/, ""), hashtags: parseHashtags(last) };
}

/**
 * Inserta un texto guardado en la posición del cursor (o reemplaza la selección), separándolo con un espacio
 * (o con un salto de línea si es un bloque de hashtags). Devuelve el texto nuevo y la posición del cursor.
 */
export function insertSnippet(text: string, snippet: string, start: number, end: number, kind: "hashtags" | "text") {
  const s = Math.max(0, Math.min(start, text.length));
  const e = Math.max(s, Math.min(end, text.length));
  const before = text.slice(0, s);
  const after = text.slice(e);
  const clean = snippet.trim();
  let sep = "";
  if (before && !/\s$/.test(before)) sep = kind === "hashtags" ? "\n\n" : " ";
  const tail = after && !/^\s/.test(after) ? " " : "";
  const next = `${before}${sep}${clean}${tail}${after}`;
  return { text: next, cursor: (before + sep + clean).length };
}

export type CaptionStats = { platform: string; chars: number; maxChars: number; hashtags: number; maxHashtags: number | null; over: boolean };

/** Contadores de caracteres y hashtags de un texto según las reglas de cada red. */
export function captionStats(text: string, platforms: string[]): CaptionStats[] {
  const tags = countHashtags(text);
  return platforms.map((platform) => {
    const maxChars = CAPTION_MAX[platform] ?? 2200;
    const maxHashtags = HASHTAG_MAX[platform] ?? null;
    return { platform, chars: text.length, maxChars, hashtags: tags, maxHashtags, over: text.length > maxChars || (maxHashtags != null && tags > maxHashtags) };
  });
}

/** Opciones por red que guarda una plantilla. */
export type TemplateOptions = Partial<Record<"instagram" | "youtube", PlatformOptions>>;

const YT_KEYS = ["yt_title", "yt_privacy", "yt_made_for_kids", "yt_tags", "yt_category_id", "yt_notify_subscribers", "yt_embeddable", "yt_license", "yt_language"] as const;

/**
 * Opciones por red que se guardan en una plantilla a partir de los destinos del editor.
 *  - TikTok: NADA. Sus Content Sharing Guidelines exigen que privacidad, interacciones y divulgación comercial
 *    las elija el usuario en cada publicación (sin valores por defecto).
 *  - YouTube: sin miniatura (es un medio concreto) y la lista de reproducción solo si hay un único canal.
 */
export function templateOptionsFromTargets(targets: { platform: string; options: PlatformOptions }[]): TemplateOptions {
  const out: TemplateOptions = {};
  const yt = targets.filter((t) => t.platform === "youtube");
  if (yt.length) {
    const src = yt[0].options;
    const o: PlatformOptions = {};
    for (const k of YT_KEYS) if (src[k] !== undefined) (o as Record<string, unknown>)[k] = src[k];
    if (yt.length === 1 && src.yt_playlist_id) o.yt_playlist_id = src.yt_playlist_id;
    if (Object.keys(o).length) out.youtube = o;
  }
  return out;
}

/** Opciones de un destino al aplicar una plantilla (con los huecos del título de YouTube rellenados). */
export function optionsForPlatform(options: TemplateOptions | null | undefined, platform: string, values: Record<string, string | undefined> = {}): PlatformOptions {
  if (platform !== "youtube") return {};
  const o = { ...(options?.youtube ?? {}) };
  if (o.yt_title) o.yt_title = fillPlaceholders(o.yt_title, values);
  return o;
}

/** Fecha y hora local "YYYY-MM-DDTHH:MM" de la próxima vez que llega `time` (HH:MM) en la hora local de `now`. */
export function nextLocalSlot(now: Date, time: string): string {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= now.getTime() + 10 * 60_000) d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
