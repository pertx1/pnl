import { describe, expect, it } from "vitest";
import { validateTarget, ytTagsLength } from "@/lib/posts/rules";

describe("Opciones de YouTube", () => {
  it("cuenta la longitud de etiquetas como YouTube (comas y comillas en etiquetas con espacios)", () => {
    expect(ytTagsLength([])).toBe(0);
    expect(ytTagsLength(["cafe"])).toBe(4);
    expect(ytTagsLength(["cafe", "receta"])).toBe(11); // 4 + 6 + 1 separador
    expect(ytTagsLength(["cafe frio"])).toBe(11); // 9 + 2 comillas
  });

  it("rechaza etiquetas de más de 500 caracteres", () => {
    const tags = Array.from({ length: 40 }, (_, i) => `etiqueta-larga-${i}`);
    expect(validateTarget("youtube", "texto", ["video"], { yt_title: "Título", yt_tags: tags })).toContain("youtube_tags_too_long");
  });

  it("acepta una publicación de YouTube completa", () => {
    expect(
      validateTarget("youtube", "texto", ["video"], {
        yt_title: "Título",
        yt_tags: ["cafe", "receta"],
        yt_category_id: "26",
        yt_language: "es",
        yt_license: "youtube",
      }),
    ).toEqual([]);
  });
});
