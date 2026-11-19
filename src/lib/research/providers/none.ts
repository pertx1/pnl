import "server-only";
import { RESEARCH_CREDITS } from "../credits";
import { ResearchError } from "../http";
import type { PublicDataProvider } from "./types";

/**
 * TikTok: no hay API oficial para perfiles ajenos (la Research API es solo para investigación académica/no comercial).
 * Proveedor "none": la UI muestra "Próximamente · datos estimados de un proveedor externo" con su coste en créditos.
 * Cuando se contrate un proveedor externo LEGAL (con licencia y método de obtención auditado por el abogado),
 * se implementa este mismo contrato. Nada de scraping.
 */
export const tiktokNoneProvider: PublicDataProvider = {
  id: "none",
  platform: "tiktok",
  availability: "coming_soon",
  needsConnectedAccount: false,
  creditsPerFetch: RESEARCH_CREDITS.tiktokProfile,
  isConfigured: () => false,
  async lookup() {
    throw new ResearchError("tiktok", "coming_soon");
  },
  async refresh() {
    throw new ResearchError("tiktok", "coming_soon");
  },
};
