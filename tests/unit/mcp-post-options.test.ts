import { describe, expect, it } from "vitest";
import { tiktokOptionsSchema, toPlatformOptions, youtubeOptionsSchema } from "@/lib/mcp/post-options";
import { validateTarget } from "@/lib/posts/rules";

describe("MCP · opciones por red", () => {
  it("YouTube: mapea etiquetas, privacidad y usa el título interno por defecto", () => {
    const o = toPlatformOptions("youtube", { youtube: { tags: ["gta 6", "dinero"], privacy: "public", category_id: "20" } }, "Cómo ganar dinero en GTA 6");
    expect(o).toEqual({ yt_title: "Cómo ganar dinero en GTA 6", yt_tags: ["gta 6", "dinero"], yt_privacy: "public", yt_category_id: "20" });
  });
  it("TikTok: allow_* se guarda como disable_*", () => {
    expect(toPlatformOptions("tiktok", { tiktok: { allow_comments: true } })).toEqual({ disable_comment: false });
  });
  it("TikTok: el asistente no puede fijar la privacidad (la elige una persona en Kreo) → nunca pasa a aprobación", () => {
    expect(tiktokOptionsSchema.safeParse({ privacy_level: "PUBLIC_TO_EVERYONE" }).success).toBe(false);
    const o = toPlatformOptions("tiktok", { tiktok: { allow_comments: true, brand_organic: true } });
    expect(validateTarget("tiktok", "hola", ["video"], o)).toContain("tiktok_privacy_required");
  });
  it("Instagram: reel de prueba; otras redes ignoran opciones ajenas", () => {
    expect(toPlatformOptions("instagram", { instagram: { trial_reel: "manual" }, youtube: { title: "x" } })).toEqual({ ig_trial_reel: "manual" });
  });
  it("rechaza campos desconocidos", () => {
    expect(youtubeOptionsSchema.safeParse({ tags: ["a"], foo: 1 }).success).toBe(false);
  });
});
