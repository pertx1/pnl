/**
 * Contrato de fuentes de anuncios (productos ganadores). Solo fuentes LEGALES de transparencia publicitaria
 * (Meta Ad Library API; en el futuro, p. ej. TikTok Commercial Content API si se aprueba). Nada de scraping.
 */
export type AdStatus = "ACTIVE" | "INACTIVE" | "ALL";
export type AdPlatform = "FACEBOOK" | "INSTAGRAM" | "AUDIENCE_NETWORK" | "MESSENGER" | "THREADS" | "WHATSAPP";

export type AdSearchQuery = {
  terms: string;
  country: string;
  language?: string;
  dateMin?: string;
  dateMax?: string;
  status: AdStatus;
  platform?: AdPlatform;
  exactPhrase?: boolean;
  after?: string;
};

export type AdResult = {
  id: string;
  pageId: string;
  pageName: string;
  bodies: string[];
  linkTitles: string[];
  linkCaptions: string[];
  /** Enlace público a la ficha en la Ad Library (NO usamos ad_snapshot_url: lleva el token en la URL). */
  libraryUrl: string;
  startedAt: string | null;
  stoppedAt: string | null;
  platforms: string[];
  languages: string[];
  countries: string[];
  euReach: number | null;
};

export interface AdSource {
  id: string;
  label: string;
  isConfigured(): boolean;
  search(q: AdSearchQuery): Promise<{ ads: AdResult[]; nextCursor: string | null }>;
}
