import { describe, expect, it } from "vitest";
import { musicCredits, voiceCredits, VOICE_MODELS } from "@/lib/ai/audio";
import {
  analysisCredits,
  nearestNamedColor,
  normalizeSegments,
  normalizeTranscript,
  renderCredits,
  safeTitle,
  srtTime,
  subtitleStyle,
  toSrt,
  transcriptDuration,
  transcriptForPrompt,
} from "@/lib/clipper/segments";

const chunks = normalizeTranscript(
  [...Array.from({ length: 40 }, (_, i) => ({ timestamp: [i * 5, i * 5 + 5] as (number | null)[], text: ` Frase ${i} ` })), { timestamp: [200, null], text: "final" }],
);

describe("transcripción", () => {
  it("normaliza los trozos de Whisper (fin nulo, espacios, orden)", () => {
    expect(chunks[0]).toEqual({ s: 0, e: 5, t: "Frase 0" });
    const last = chunks.at(-1)!;
    expect(last.s).toBe(200);
    expect(last.e).toBeGreaterThan(200);
    expect(normalizeTranscript([{ timestamp: [1, 2], text: "  " }, { text: "sin tiempo" }])).toEqual([]);
    expect(transcriptDuration(chunks)).toBeGreaterThan(200);
  });
  it("texto para el agente con marcas de tiempo y límite de tamaño", () => {
    expect(transcriptForPrompt(chunks)).toContain("[0.0-5.0] Frase 0");
    expect(transcriptForPrompt(chunks, 40).length).toBeLessThanOrEqual(40);
  });
});

describe("segmentos propuestos por la IA", () => {
  const seg = (start: number, end: number, score: number, title = "t") => ({ start, end, score, title, hook: "h", reason: "r" });
  it("se alinean a frases, respetan 10–90 s y quedan dentro del vídeo", () => {
    const out = normalizeSegments([seg(12, 40, 80), seg(150, 400, 70), seg(-5, 3, 90)], chunks, 205);
    for (const s of out) {
      expect(s.end - s.start).toBeGreaterThanOrEqual(8);
      expect(s.end - s.start).toBeLessThanOrEqual(90);
      expect(s.start).toBeGreaterThanOrEqual(0);
      expect(s.end).toBeLessThanOrEqual(205);
    }
    expect(out.find((s) => s.score === 80)?.start).toBe(10); // alineado al inicio de la frase que contiene el segundo 12
  });
  it("descarta solapes fuertes (gana la mayor puntuación) y ordena por puntuación", () => {
    const out = normalizeSegments([seg(20, 50, 60, "a"), seg(25, 55, 90, "b"), seg(100, 130, 75, "c")], chunks, 205);
    expect(out.map((s) => s.title)).toEqual(["b", "c"]);
  });
  it("máximo 8, puntuación acotada a 0–100 y datos inválidos fuera", () => {
    const many = Array.from({ length: 15 }, (_, i) => seg(i * 12, i * 12 + 11, 200 - i));
    const out = normalizeSegments([...many, seg(Number.NaN, 5, 50)], chunks, 205);
    expect(out.length).toBeLessThanOrEqual(8);
    expect(out[0].score).toBe(100);
  });
});

describe("subtítulos .srt", () => {
  it("formatea tiempos", () => {
    expect(srtTime(0)).toBe("00:00:00,000");
    expect(srtTime(3661.5)).toBe("01:01:01,500");
  });
  it("genera el tramo con tiempos relativos al inicio del clip", () => {
    const srt = toSrt(chunks, 10, 20);
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:05,000\nFrase 2");
    expect(srt).toContain("2\n00:00:05,000 --> 00:00:10,000\nFrase 3");
    expect(srt).not.toContain("Frase 4");
  });
});

describe("colores del brand kit para los subtítulos", () => {
  it("elige el color con nombre más cercano", () => {
    expect(nearestNamedColor("#C6F432")).toBe("yellow");
    expect(nearestNamedColor("#FF5C5C")).toBe("red");
    expect(nearestNamedColor("#1F6FB2")).toBe("blue");
    expect(nearestNamedColor("#FFB547")).toBe("orange");
    expect(nearestNamedColor("#F3F5EC")).toBe("white");
    expect(nearestNamedColor("nope")).toBeNull();
  });
  it("ignora neutros para el resaltado y usa amarillo por defecto", () => {
    expect(subtitleStyle(["#FFFFFF", "#111111", "#FF5C5C"]).highlight_color).toBe("red");
    expect(subtitleStyle([]).highlight_color).toBe("yellow");
    expect(subtitleStyle([]).font_color).toBe("white");
  });
});

describe("créditos (1 crédito ≈ 0,01 $)", () => {
  it("Clipper: análisis por minutos y render por short", () => {
    expect(analysisCredits(30)).toBe(1 + 2 + 1);
    expect(analysisCredits(60 * 60)).toBe(60 + 2 + 12);
    expect(renderCredits(30, false)).toBe(7);
    expect(renderCredits(60, true)).toBe(7 + 3);
  });
  it("Audio: voz por caracteres y música por minuto", () => {
    const [multilingual, flash] = VOICE_MODELS;
    expect(voiceCredits(multilingual, 1000)).toBe(8);
    expect(voiceCredits(flash, 1000)).toBe(4);
    expect(voiceCredits(flash, 10)).toBe(1);
    expect(musicCredits(60)).toBe(15);
    expect(musicCredits(30)).toBe(8);
  });
  it("título seguro a partir del nombre de archivo", () => {
    expect(safeTitle("Mi podcast #12 <final>.mp4")).toBe("Mi podcast 12 final");
    expect(safeTitle(".mp4")).toBe("Vídeo");
  });
});
