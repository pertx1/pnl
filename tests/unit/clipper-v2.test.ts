import { describe, expect, it } from "vitest";
import { CLIPPER_LICENSE, FAL, stepInput } from "@/lib/clipper/pipeline";
import { clipCopyCredits, normalizeClipCopy, planClipSchedule } from "@/lib/clipper/schedule";
import { normalizeSegments, normalizeTranscript, wordsToSrt } from "@/lib/clipper/segments";
import {
  accentToNamed,
  CLIP_FORMATS,
  cropWindow,
  DEFAULT_RENDER_OPTIONS,
  FORMAT_KEYS,
  LAYOUTS,
  parseRenderOptions,
  renderOptionsSchema,
  resolveRenderOptions,
  scaleInput,
  STYLE_PRESETS,
  SUBTITLE_POSITIONS,
  SUBTITLE_STYLES,
  subtitleInput,
  subtitleYOffset,
  type RenderOptions,
} from "@/lib/clipper/styles";
import { hasBreakdown, normalizeBreakdown, VIRALITY_WEIGHTS, viralityScore, viralityTier } from "@/lib/clipper/virality";
import { crc32, uniqueNames, zipStore } from "@/lib/clipper/zip";
import { computeFreeSlots, zonedParts } from "@/lib/mcp/calendar";
import { ytTagsLength } from "@/lib/posts/rules";

const opts = (o: Partial<RenderOptions> = {}): RenderOptions => ({ ...DEFAULT_RENDER_OPTIONS, ...o });

describe("puntuación de viralidad", () => {
  it("los pesos suman 1 y el total es la media ponderada redondeada", () => {
    expect(Object.values(VIRALITY_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(viralityScore({ hook: 100, pacing: 100, value: 100, trend: 100 })).toBe(100);
    expect(viralityScore({ hook: 0, pacing: 0, value: 0, trend: 0 })).toBe(0);
    // 80*0.35 + 60*0.2 + 70*0.3 + 40*0.15 = 28 + 12 + 21 + 6 = 67
    expect(viralityScore({ hook: 80, pacing: 60, value: 70, trend: 40 })).toBe(67);
  });
  it("normaliza valores fuera de rango o inválidos", () => {
    expect(normalizeBreakdown({ hook: 140, pacing: -5, value: "50", trend: Number.NaN })).toEqual({ hook: 100, pacing: 0, value: 50, trend: 0 });
    expect(normalizeBreakdown(null)).toEqual({ hook: 0, pacing: 0, value: 0, trend: 0 });
    expect(hasBreakdown({ hook: 1, pacing: 2, value: 3, trend: 4 })).toBe(true);
    expect(hasBreakdown({})).toBe(false);
    expect([viralityTier(80), viralityTier(60), viralityTier(20)]).toEqual(["high", "mid", "low"]);
  });
  it("los segmentos con desglose se puntúan con los pesos y se ordenan por puntuación", () => {
    const chunks = normalizeTranscript(Array.from({ length: 30 }, (_, i) => ({ timestamp: [i * 5, i * 5 + 5], text: `Frase ${i}` })));
    const segs = normalizeSegments(
      [
        { start: 0, end: 30, title: "A", hook: "", reason: "", score: 99, breakdown: { hook: 20, pacing: 20, value: 20, trend: 20 } },
        { start: 60, end: 90, title: "B", hook: "", reason: "", score: 0, breakdown: { hook: 90, pacing: 80, value: 90, trend: 70 } },
      ],
      chunks,
      150,
    );
    expect(segs.map((s) => s.title)).toEqual(["B", "A"]);
    expect(segs[0].score).toBe(viralityScore({ hook: 90, pacing: 80, value: 90, trend: 70 }));
    expect(segs[1].score).toBe(20); // ignora el total que diga la IA
    expect(segs[0].breakdown).toEqual({ hook: 90, pacing: 80, value: 90, trend: 70 });
  });
});

describe("formatos y encuadre", () => {
  it("scale-video: recorte centrado o encajar con bandas, en las tres medidas", () => {
    expect(scaleInput("u", opts())).toMatchObject({ width: 1080, height: 1920, mode: "crop" });
    expect(scaleInput("u", opts())).not.toHaveProperty("pad_color");
    expect(scaleInput("u", opts({ format: "1:1", layout: "fit", padColor: "white" }))).toMatchObject({ width: 1080, height: 1080, mode: "pad", pad_color: "white" });
    expect(scaleInput("u", opts({ format: "16:9" }))).toMatchObject({ width: 1920, height: 1080 });
    for (const f of FORMAT_KEYS) expect(CLIP_FORMATS[f].width % 2 + (CLIP_FORMATS[f].height % 2)).toBe(0); // scale-video exige medidas pares
  });
  it("zona conservada al recortar (vista previa)", () => {
    const w = cropWindow(1920, 1080, "9:16", "crop");
    expect(w.h).toBe(1);
    expect(w.w).toBeCloseTo(9 / 16 / (16 / 9), 5);
    expect(w.x).toBeCloseTo((1 - w.w) / 2, 5);
    expect(cropWindow(1920, 1080, "16:9", "crop")).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(cropWindow(1080, 1920, "1:1", "crop").w).toBe(1);
    expect(cropWindow(1920, 1080, "9:16", "fit")).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(cropWindow(0, 0, "9:16", "crop")).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
  it("opciones: esquema estricto y valores por defecto al leer opciones antiguas", () => {
    expect(renderOptionsSchema.safeParse(opts({ accent: "#C6F432" })).success).toBe(true);
    expect(renderOptionsSchema.safeParse({ ...opts(), accent: "url(javascript:x)" }).success).toBe(false);
    expect(renderOptionsSchema.safeParse({ ...opts(), format: "4:5" }).success).toBe(false);
    expect(parseRenderOptions({})).toEqual(DEFAULT_RENDER_OPTIONS);
    expect(parseRenderOptions({ format: "1:1" }).format).toBe("1:1");
    expect(parseRenderOptions(null)).toEqual(DEFAULT_RENDER_OPTIONS);
  });
});

describe("plantillas de subtítulos (parámetros reales de auto-subtitle)", () => {
  const ALLOWED = new Set([
    "video_url",
    "language",
    "font_name",
    "font_size",
    "font_weight",
    "font_color",
    "highlight_color",
    "stroke_width",
    "stroke_color",
    "background_color",
    "background_opacity",
    "position",
    "y_offset",
    "words_per_subtitle",
    "enable_animation",
  ]);
  const COLORS = new Set(["white", "black", "red", "green", "blue", "yellow", "orange", "purple", "pink", "brown", "gray", "cyan", "magenta"]);

  it("al menos 5 plantillas y todas usan solo parámetros y colores documentados", () => {
    expect(SUBTITLE_STYLES.length).toBeGreaterThanOrEqual(5);
    for (const style of SUBTITLE_STYLES)
      for (const position of SUBTITLE_POSITIONS)
        for (const format of FORMAT_KEYS) {
          const input = subtitleInput("u", resolveRenderOptions(opts({ style, position, format, accent: "#7C3AED" }), "Inter"), "es");
          for (const k of Object.keys(input)) expect(ALLOWED.has(k)).toBe(true);
          expect(COLORS.has(input.font_color)).toBe(true);
          expect(COLORS.has(input.highlight_color)).toBe(true);
          expect(COLORS.has(input.stroke_color)).toBe(true);
          expect(input.background_color === "none" || COLORS.has(input.background_color)).toBe(true);
          expect(["normal", "bold", "black"]).toContain(input.font_weight);
          expect(input.position).toBe(position);
        }
  });
  it("cada plantilla tiene su carácter", () => {
    const r = (o: Partial<RenderOptions>) => subtitleInput("u", resolveRenderOptions(opts(o), "Poppins"), "es");
    expect(r({ style: "karaoke", accent: "#FF0000" })).toMatchObject({ font_name: "Poppins", highlight_color: "red", font_color: "white", words_per_subtitle: 3, background_color: "none" });
    expect(r({ style: "box", accent: "#0000FF" })).toMatchObject({ background_color: "blue", background_opacity: 0.9, font_color: "white", words_per_subtitle: 2 });
    expect(r({ style: "box", accent: "yellow" })).toMatchObject({ background_color: "yellow", font_color: "black", stroke_color: "white" });
    expect(r({ style: "caps" })).toMatchObject({ font_name: "Bebas Neue", font_weight: "normal" });
    const minimal = r({ style: "minimal" });
    expect(minimal.highlight_color).toBe(minimal.font_color); // sin resaltado
    expect(minimal.enable_animation).toBe(false);
    expect(r({ style: "word", accent: "green" })).toMatchObject({ words_per_subtitle: 1, font_color: "green" });
  });
  it("tamaño, posición, idioma y colores del brand kit", () => {
    const base = STYLE_PRESETS.karaoke.size;
    const size = (s: RenderOptions["size"]) => subtitleInput("u", resolveRenderOptions(opts({ size: s }), null), "es").font_size;
    expect(size("s")).toBeLessThan(base);
    expect(size("m")).toBe(base);
    expect(size("l")).toBeGreaterThan(base);
    expect(subtitleYOffset("9:16", "bottom")).toBeLessThan(-200); // por encima de la interfaz de TikTok/Reels
    expect(subtitleYOffset("9:16", "center")).toBe(0);
    expect(subtitleYOffset("1:1", "top")).toBeGreaterThan(0);
    expect(subtitleInput("u", resolveRenderOptions(opts(), null), "<script>").language).toBe("es");
    expect(accentToNamed("#C6F432")).toBe("yellow"); // lima de Kreo → amarillo
    expect(accentToNamed("magenta")).toBe("magenta");
    // Acento igual al texto → se cambia para que el resaltado se vea.
    expect(resolveRenderOptions(opts({ accent: "white", textColor: "white" }), null).accentNamed).toBe("yellow");
    expect(resolveRenderOptions(opts(), "Fira Sans; drop").fontName).toBe("Fira Sans drop");
    expect(resolveRenderOptions(opts(), "").fontName).toBe("Montserrat");
  });
});

describe("sin marca de agua", () => {
  it("solo se llaman cuatro endpoints conocidos, todos con uso comercial", () => {
    expect(Object.values(FAL).sort()).toEqual(
      ["fal-ai/whisper", "fal-ai/workflow-utilities/auto-subtitle", "fal-ai/workflow-utilities/scale-video", "fal-ai/workflow-utilities/trim-video"].sort(),
    );
    for (const e of Object.values(FAL)) expect(CLIPPER_LICENSE.endpoints[e]).toMatch(/^commercial/);
  });
  it("ningún paso del render lleva parámetros de marca de agua, logo ni capas extra", () => {
    const bad = /watermark|logo|overlay|brand|kreo|image_url|text_overlay/i;
    for (const format of FORMAT_KEYS)
      for (const layout of LAYOUTS)
        for (const style of SUBTITLE_STYLES) {
          const r = resolveRenderOptions(opts({ format, layout, style }), null);
          for (const step of ["trim", "scale", "subtitle"] as const) {
            const input = stepInput(step, "https://v3.fal.media/x.mp4", { start_s: 10, end_s: 40 }, r, "es");
            for (const [k, v] of Object.entries(input)) {
              expect(k).not.toMatch(bad);
              if (typeof v === "string" && k !== "video_url") expect(v).not.toMatch(bad);
            }
          }
        }
  });
});

describe(".srt del clip", () => {
  it("agrupa palabras con tiempos en líneas cortas y corta en pausas", () => {
    const words = [
      { text: "Hola", start: 0, end: 0.4, type: "word" },
      { text: " ", start: 0.4, end: 0.5, type: "spacing" },
      { text: "a", start: 0.5, end: 0.6, type: "word" },
      { text: "todos", start: 0.6, end: 1, type: "word" },
      { text: "Después", start: 3, end: 3.5, type: "word" },
    ];
    const srt = wordsToSrt(words);
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:01,000\nHola a todos\n");
    expect(srt).toContain("2\n00:00:03,000 --> 00:00:03,500\nDespués\n");
    expect(wordsToSrt(null)).toBe("");
    expect(wordsToSrt([{ word: "x", start: "a", end: 1 }])).toBe("");
  });
});

describe("programar clips en huecos libres", () => {
  const tz = "Europe/Madrid";
  const now = new Date("2026-11-23T10:00:00Z");
  const days = ["2026-11-24", "2026-11-25", "2026-11-26"];
  const accounts = [
    { id: "ig", platform: "instagram", handle: "@a", dailyLimit: 2, preferredHour: 19 },
    { id: "tt", platform: "tiktok", handle: "@a", dailyLimit: 1, preferredHour: 18 },
  ];

  it("reparte un clip por día a la hora sugerida, en hora de Madrid", () => {
    const free = computeFreeSlots({ days, tz, now, accounts, posts: [] });
    const plan = planClipSchedule({ clipIds: ["c1", "c2"], days: free, accountIds: ["ig"], perDay: 1, tz });
    expect(plan.unscheduled).toEqual([]);
    expect(plan.slots.map((s) => [s.clipId, s.day, s.time])).toEqual([
      ["c1", "2026-11-24", "19:00"],
      ["c2", "2026-11-25", "19:00"],
    ]);
    expect(zonedParts(new Date(plan.slots[0].scheduledAt), tz)).toMatchObject({ day: "2026-11-24", time: "19:00" });
    expect(plan.slots[0].scheduledAt).toBe("2026-11-24T18:00:00.000Z"); // invierno: UTC+1
  });

  it("respeta el límite diario de la cuenta más ajustada y separa los clips del mismo día", () => {
    const free = computeFreeSlots({ days, tz, now, accounts, posts: [] });
    // Instagram admite 2/día, TikTok 1/día → con las dos cuentas, 1 por día aunque se pidan 3.
    const both = planClipSchedule({ clipIds: ["a", "b", "c"], days: free, accountIds: ["ig", "tt"], perDay: 3, tz });
    expect(both.slots.map((s) => s.day)).toEqual(days);
    // Solo Instagram con 2/día → dos el primer día, separados al menos 2 h.
    const ig = planClipSchedule({ clipIds: ["a", "b", "c"], days: free, accountIds: ["ig"], perDay: 2, tz });
    expect(ig.slots.filter((s) => s.day === "2026-11-24")).toHaveLength(2);
    const [t1, t2] = ig.slots.filter((s) => s.day === "2026-11-24").map((s) => new Date(s.scheduledAt).getTime());
    expect(Math.abs(t2 - t1)).toBeGreaterThanOrEqual(2 * 3600_000);
  });

  it("salta los días llenos y devuelve los que no caben", () => {
    const posts = [
      { scheduledAt: "2026-11-24T17:00:00Z", status: "scheduled", accountIds: ["tt"] },
      { scheduledAt: "2026-11-25T17:00:00Z", status: "pending_approval", accountIds: ["tt"] },
    ];
    const free = computeFreeSlots({ days, tz, now, accounts, posts });
    const plan = planClipSchedule({ clipIds: ["a", "b"], days: free, accountIds: ["tt"], perDay: 1, tz });
    expect(plan.slots.map((s) => s.day)).toEqual(["2026-11-26"]);
    expect(plan.unscheduled).toEqual(["b"]);
    expect(planClipSchedule({ clipIds: ["a"], days: free, accountIds: [], perDay: 1, tz }).unscheduled).toEqual(["a"]);
    // Cuenta desconocida ese día → no se arriesga.
    expect(planClipSchedule({ clipIds: ["a"], days: free, accountIds: ["otra"], perDay: 1, tz }).slots).toEqual([]);
  });

  it("evita la franja de una publicación existente", () => {
    const posts = [{ scheduledAt: "2026-11-24T18:00:00Z", status: "draft", accountIds: ["ig"] }]; // 19:00 en Madrid
    const free = computeFreeSlots({ days: ["2026-11-24"], tz, now, accounts, posts });
    const plan = planClipSchedule({ clipIds: ["a"], days: free, accountIds: ["ig"], perDay: 1, tz });
    const local = zonedParts(new Date(plan.slots[0].scheduledAt), tz).minutes;
    expect(Math.abs(local - 19 * 60)).toBeGreaterThanOrEqual(60);
  });
});

describe("textos por red", () => {
  it("recorta a los límites de cada red y limpia las etiquetas de YouTube", () => {
    const copy = normalizeClipCopy(
      {
        tiktok: "x".repeat(3000),
        instagram: "  hola  ",
        youtubeTitle: "t".repeat(150),
        youtubeDescription: "desc <b>",
        youtubeTags: ["#Uno", "uno", "dos, tres", "", ...Array.from({ length: 40 }, (_, i) => `etiqueta larga ${i}`)],
      },
      "Fallback",
    );
    expect(copy.tiktok).toHaveLength(2200);
    expect(copy.instagram).toBe("hola");
    expect(copy.youtubeTitle).toHaveLength(100);
    expect(copy.youtubeDescription).toBe("desc b");
    expect(copy.youtubeTags.slice(0, 2)).toEqual(["Uno", "dos tres"]);
    expect(copy.youtubeTags.length).toBeLessThanOrEqual(15);
    expect(ytTagsLength(copy.youtubeTags)).toBeLessThanOrEqual(500);
    expect(normalizeClipCopy({}, "Mi clip").youtubeTitle).toBe("Mi clip");
    expect(clipCopyCredits(3)).toBe(3);
    expect(clipCopyCredits(0)).toBe(1);
  });
});

describe("ZIP del lote", () => {
  it("CRC-32 estándar y estructura STORE válida", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686);
    const data = new TextEncoder().encode("abc");
    const parts = zipStore([{ name: "a.mp4", data }]);
    const total = parts.reduce((n, p) => n + p.length, 0);
    const buf = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      buf.set(p, o);
      o += p.length;
    }
    const v = new DataView(buf.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(14, true)).toBe(crc32(data));
    const end = total - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(1);
    const cdOffset = v.getUint32(end + 16, true);
    expect(v.getUint32(cdOffset, true)).toBe(0x02014b50);
    expect(new TextDecoder().decode(buf.slice(30 + 5, 30 + 5 + 3))).toBe("abc");
  });
  it("nombres únicos y seguros", () => {
    expect(uniqueNames(["a.mp4", "a.mp4", "b/c.mp4", ""])).toEqual(["a.mp4", "a-2.mp4", "b-c.mp4", "clip.mp4"]);
  });
});
