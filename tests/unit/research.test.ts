import { describe, expect, it } from "vitest";
import { computeMargin } from "@/lib/research/margin";
import { averagePerWeek, findOutliers, median, performanceValue, postsPerWeek } from "@/lib/research/metrics";
import { detectNetwork, normalizeTags, parseInstagramInput, parseTikTokInput, parseYouTubeInput, safeHttpsUrl } from "@/lib/research/parse";
import { countVariantsByPage, daysActive, winningScore } from "@/lib/research/score";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe("métricas de competencia", () => {
  it("mediana con número par e impar de valores", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("detecta outliers ≥ 3× la mediana y calcula el múltiplo con un decimal", () => {
    const posts = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, publishedAt: daysAgo(i + 1), value: 1000 }));
    posts.push({ id: "viral", publishedAt: daysAgo(3), value: 6200 });
    const { median: med, outliers } = findOutliers(posts);
    expect(med).toBe(1000);
    expect(outliers).toHaveLength(1);
    expect(outliers[0].post.id).toBe("viral");
    expect(outliers[0].multiple).toBe(6.2);
  });

  it("no marca outliers con menos de 5 publicaciones o mediana 0", () => {
    expect(findOutliers([{ id: "a", publishedAt: daysAgo(1), value: 10 }, { id: "b", publishedAt: daysAgo(2), value: 100 }]).outliers).toEqual([]);
    const zeros = Array.from({ length: 6 }, (_, i) => ({ id: `z${i}`, publishedAt: daysAgo(i), value: 0 }));
    expect(findOutliers([...zeros, { id: "x", publishedAt: daysAgo(1), value: 50 }]).outliers).toEqual([]);
  });

  it("usa solo las ~30 publicaciones más recientes", () => {
    const old = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, publishedAt: daysAgo(i + 1), value: 100 }));
    const ancientViral = { id: "ancient", publishedAt: daysAgo(400), value: 100_000 };
    expect(findOutliers([...old, ancientViral]).outliers).toEqual([]);
  });

  it("frecuencia: publicaciones por semana en las últimas 8 semanas", () => {
    const dates = [daysAgo(1), daysAgo(2), daysAgo(8), daysAgo(55), daysAgo(60), null];
    const weeks = postsPerWeek(dates, 8, NOW);
    expect(weeks).toHaveLength(8);
    expect(weeks[7].count).toBe(2);
    expect(weeks[6].count).toBe(1);
    expect(weeks[0].count).toBe(1); // 55 días → semana más antigua; 60 días queda fuera
    expect(averagePerWeek(weeks)).toBe(0.5);
  });

  it("valor de rendimiento: views si hay; si no, likes + comentarios", () => {
    expect(performanceValue({ views: 500, likes: 10, comments: 1 })).toBe(500);
    expect(performanceValue({ views: null, likes: 10, comments: 5 })).toBe(15);
    expect(performanceValue({ views: null, likes: null, comments: null })).toBeNull();
  });
});

describe("puntuación de producto ganador", () => {
  it("días activo hasta hoy o hasta la fecha de fin", () => {
    expect(daysActive(daysAgo(10), null, NOW)).toBe(10);
    expect(daysActive(daysAgo(10), daysAgo(4), NOW)).toBe(6);
    expect(daysActive(null, null, NOW)).toBeNull();
  });

  it("máximo 100 con todas las señales al tope", () => {
    const r = winningScore({ startedAt: daysAgo(90), stoppedAt: null, variants: 15, platforms: 4, countries: 8, euReach: 5_000_000, now: NOW });
    expect(r.score).toBe(100);
    expect(r.factors.map((f) => f.key)).toEqual(["days", "variants", "platforms", "countries", "reach"]);
  });

  it("anuncio nuevo, único y en una plataforma puntúa bajo y es explicable", () => {
    const r = winningScore({ startedAt: daysAgo(2), stoppedAt: null, variants: 1, platforms: 1, countries: 0, euReach: null, now: NOW });
    expect(r.score).toBeLessThan(15);
    const days = r.factors.find((f) => f.key === "days")!;
    expect(days.value).toBe(2);
    expect(days.max).toBe(40);
    expect(r.factors.find((f) => f.key === "variants")!.points).toBe(0);
  });

  it("30 días activo = la mitad de los puntos de antigüedad", () => {
    const r = winningScore({ startedAt: daysAgo(30), stoppedAt: null, variants: 1, platforms: 0, countries: 0, euReach: null, now: NOW });
    expect(r.score).toBe(20);
  });

  it("cuenta variantes por página", () => {
    const m = countVariantsByPage([{ pageId: "a" }, { pageId: "a" }, { pageId: "b" }]);
    expect(m.get("a")).toBe(2);
    expect(m.get("b")).toBe(1);
  });
});

describe("calculadora de margen", () => {
  it("margen €, %, CPA máximo y ROAS mínimo", () => {
    const r = computeMargin({ salePrice: 30, unitCost: 8, shipping: 4, feePct: 3, cpa: 10 });
    expect(r.fees).toBe(0.9);
    expect(r.totalCost).toBe(22.9);
    expect(r.margin).toBe(7.1);
    expect(r.marginPct).toBe(23.67);
    expect(r.breakEvenCpa).toBe(17.1);
    expect(r.breakEvenRoas).toBe(1.75);
  });

  it("margen negativo y valores no válidos tratados como 0", () => {
    const r = computeMargin({ salePrice: 10, unitCost: 12, shipping: Number.NaN, feePct: -5, cpa: 0 });
    expect(r.margin).toBe(-2);
    expect(r.breakEvenCpa).toBe(0);
    expect(r.breakEvenRoas).toBeNull();
    expect(computeMargin({ salePrice: 0, unitCost: 1, shipping: 0, feePct: 0, cpa: 0 }).marginPct).toBeNull();
  });
});

describe("parseo de entradas", () => {
  it("YouTube: @handle, URL de handle, URL de canal e ID", () => {
    expect(parseYouTubeInput("@MrBeast")).toEqual({ kind: "handle", value: "@MrBeast" });
    expect(parseYouTubeInput("mrbeast")).toEqual({ kind: "handle", value: "@mrbeast" });
    expect(parseYouTubeInput("https://www.youtube.com/@MrBeast/videos")).toEqual({ kind: "handle", value: "@MrBeast" });
    expect(parseYouTubeInput("https://youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA")).toEqual({ kind: "id", value: "UCX6OQ3DkcsbYNE6H8uQQuVA" });
    expect(parseYouTubeInput("UCX6OQ3DkcsbYNE6H8uQQuVA")).toEqual({ kind: "id", value: "UCX6OQ3DkcsbYNE6H8uQQuVA" });
    expect(parseYouTubeInput("https://evil.com/@x")).toBeNull();
    expect(parseYouTubeInput("")).toBeNull();
  });

  it("Instagram y TikTok: usuario desde @ o URL", () => {
    expect(parseInstagramInput("@Nike")).toBe("nike");
    expect(parseInstagramInput("https://www.instagram.com/nike/?hl=es")).toBe("nike");
    expect(parseInstagramInput("https://instagram.com.evil.io/nike")).toBeNull();
    expect(parseInstagramInput("no valid!")).toBeNull();
    expect(parseTikTokInput("https://www.tiktok.com/@khaby.lame")).toBe("khaby.lame");
  });

  it("solo https, sin credenciales en la URL", () => {
    expect(safeHttpsUrl("https://www.tiktok.com/@a/video/1#x")).toBe("https://www.tiktok.com/@a/video/1");
    expect(safeHttpsUrl("http://example.com")).toBeNull();
    expect(safeHttpsUrl("https://user:pass@example.com")).toBeNull();
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl("https://localhost/x")).toBeNull();
  });

  it("detecta la red del enlace", () => {
    expect(detectNetwork("https://youtu.be/abc")).toBe("youtube");
    expect(detectNetwork("https://m.youtube.com/watch?v=abc")).toBe("youtube");
    expect(detectNetwork("https://www.tiktok.com/@a/video/1")).toBe("tiktok");
    expect(detectNetwork("https://www.instagram.com/p/abc/")).toBe("instagram");
    expect(detectNetwork("https://www.facebook.com/ads/library/?id=1")).toBe("facebook");
    expect(detectNetwork("https://notyoutube.com/x")).toBe("other");
  });

  it("normaliza etiquetas", () => {
    expect(normalizeTags("#Hook, UGC,hook, ,unboxing")).toEqual(["hook", "ugc", "unboxing"]);
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(20);
  });
});
