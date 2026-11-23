import { describe, expect, it } from "vitest";
import { matchesQuery, normalizeSearch } from "@/components/app/nav-config";

describe("paleta de comandos · búsqueda", () => {
  it("normaliza acentos y mayúsculas", () => {
    expect(normalizeSearch("  Analíticas ")).toBe("analiticas");
    expect(normalizeSearch("Nueva PUBLICACIÓN")).toBe("nueva publicacion");
  });

  it("encuentra sin acentos y con palabras en cualquier orden", () => {
    expect(matchesQuery("Nueva publicación Lumi Skin", "publicacion")).toBe(true);
    expect(matchesQuery("Nueva publicación Lumi Skin", "lumi nueva")).toBe(true);
    expect(matchesQuery("Calendario global", "calendário")).toBe(true);
    expect(matchesQuery("Ajustes", "equipo")).toBe(false);
  });

  it("una consulta vacía lo muestra todo", () => {
    expect(matchesQuery("Ajustes", "   ")).toBe(true);
  });
});
