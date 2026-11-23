import { describe, expect, it } from "vitest";
import { duplicateCaptionWarning, validateTarget } from "@/lib/posts/rules";

describe("reglas de publicación por red", () => {
  it("TikTok exige elegir privacidad (sin valor por defecto) y un medio", () => {
    expect(validateTarget("tiktok", "hola", [], {})).toEqual(["tiktok_privacy_required", "tiktok_media_required"]);
    expect(validateTarget("tiktok", "hola", ["video"], { privacy_level: "PUBLIC_TO_EVERYONE" })).toEqual([]);
  });

  it("TikTok: el contenido de marca no puede ser privado", () => {
    expect(validateTarget("tiktok", "x", ["video"], { privacy_level: "SELF_ONLY", brand_content_toggle: true })).toContain("tiktok_branded_private");
  });

  it("Instagram exige al menos un medio", () => {
    expect(validateTarget("instagram", "x", [], {})).toEqual(["instagram_media_required"]);
    expect(validateTarget("instagram", "x", ["image"], {})).toEqual([]);
  });

  it("YouTube exige exactamente un vídeo y título", () => {
    expect(validateTarget("youtube", "x", ["image"], {})).toEqual(["youtube_video_required", "youtube_title_required"]);
    expect(validateTarget("youtube", "x", ["video"], { yt_title: "Hola" })).toEqual([]);
  });

  it("límite de caracteres del caption", () => {
    expect(validateTarget("instagram", "a".repeat(2201), ["image"], {})).toContain("caption_too_long");
  });

  it("aviso anti-baneo con el mismo texto en 3+ cuentas", () => {
    expect(duplicateCaptionWarning(["a", "a", "b"])).toBe(false);
    expect(duplicateCaptionWarning(["a", "a ", " a"])).toBe(true);
    expect(duplicateCaptionWarning(["", "", ""])).toBe(false);
  });
});

describe("Instagram · reel de prueba", () => {
  it("exige exactamente un vídeo", async () => {
    const { validateTarget } = await import("@/lib/posts/rules");
    expect(validateTarget("instagram", "hola", ["video"], { ig_trial_reel: "manual" })).toEqual([]);
    expect(validateTarget("instagram", "hola", ["image"], { ig_trial_reel: "manual" })).toContain("instagram_trial_requires_single_video");
    expect(validateTarget("instagram", "hola", ["video", "video"], { ig_trial_reel: "auto" })).toContain("instagram_trial_requires_single_video");
    expect(validateTarget("instagram", "hola", ["image", "image"], {})).toEqual([]);
  });
});
