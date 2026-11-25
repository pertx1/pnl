import { describe, expect, it } from "vitest";
import { parseRecentProjects, projectColorIndex, projectInitials, pushRecentProject, sameSectionHref } from "@/lib/projects/identity";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("identidad de proyecto", () => {
  it("color estable y dentro de la paleta", () => {
    expect(projectColorIndex(A)).toBe(projectColorIndex(A));
    for (const id of [A, B, "x", ""]) {
      const i = projectColorIndex(id);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(5);
    }
  });

  it("iniciales", () => {
    expect(projectInitials("Pertx Studio")).toBe("PS");
    expect(projectInitials("akerra")).toBe("AK");
    expect(projectInitials("  ")).toBe("·");
    expect(projectInitials("Ñandú · tienda")).toBe("ÑT");
  });
});

describe("cambiar de proyecto en la misma sección", () => {
  it("mantiene la sección", () => {
    expect(sameSectionHref(`/app/p/${A}/studio`, "", B)).toBe(`/app/p/${B}/studio`);
    expect(sameSectionHref(`/app/p/${A}`, "", B)).toBe(`/app/p/${B}`);
    expect(sameSectionHref(`/app/p/${A}/competitors/${A}`, "", B)).toBe(`/app/p/${B}/competitors`);
  });
  it("el editor de una publicación va al calendario; «nueva» se mantiene", () => {
    expect(sameSectionHref(`/app/p/${A}/posts/${A}`, "", B)).toBe(`/app/p/${B}/calendar`);
    expect(sameSectionHref(`/app/p/${A}/posts/new`, "?date=2026-12-01", B)).toBe(`/app/p/${B}/posts/new`);
  });
  it("el calendario conserva la vista pero no los filtros", () => {
    expect(sameSectionHref(`/app/p/${A}/calendar`, "?view=week&d=2026-12-01&status=failed", B)).toBe(`/app/p/${B}/calendar?view=week&d=2026-12-01`);
  });
  it("fuera de un proyecto abre el panel", () => {
    expect(sameSectionHref("/app/agenda", "", B)).toBe(`/app/p/${B}`);
  });
});

describe("recientes", () => {
  it("parsea, deduplica y limita", () => {
    expect(parseRecentProjects(`${A},${B},${A},nope`)).toEqual([A, B]);
    expect(parseRecentProjects(undefined)).toEqual([]);
    expect(parseRecentProjects("%E0%A4%A")).toEqual([]);
  });
  it("el último usado va primero", () => {
    expect(pushRecentProject([A, B], B)).toEqual([B, A]);
  });
});
