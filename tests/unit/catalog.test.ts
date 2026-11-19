import { describe, expect, it } from "vitest";
import { creditsFor, getModel, MODELS } from "@/lib/ai/catalog";

describe("catálogo de modelos de IA", () => {
  it("créditos ≈ coste en céntimos de dólar, mínimo 1", () => {
    expect(creditsFor(getModel("flux-2-flash")!)).toBe(1);
    expect(creditsFor(getModel("seedream-4-5")!)).toBe(4);
    expect(creditsFor(getModel("pixverse-v6")!, 5)).toBe(3);
    expect(creditsFor(getModel("minimax-h3-turbo")!, 10)).toBe(25);
    expect(creditsFor(getModel("kling-2-5-turbo")!, 5)).toBe(35);
  });

  it("todos los modelos generan la entrada esperada", () => {
    for (const m of MODELS) {
      const input = m.buildInput({ prompt: "hola", aspect: "9:16", duration: m.durations?.[0], imageUrl: "https://x/y.png" });
      expect(input.prompt).toBe("hola");
      if (m.needsImage) expect(input.image_url).toBe("https://x/y.png");
    }
  });
});
