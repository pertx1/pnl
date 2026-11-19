/**
 * Contrato de las fuentes de datos públicos de perfiles ajenos (competencia).
 * Regla nº 1: SOLO APIs oficiales. Si una red no tiene API oficial para perfiles ajenos, su proveedor es "none"
 * y la UI la muestra como "Próximamente". Nada de scraping ni APIs no oficiales.
 */
export type CompetitorPlatform = "youtube" | "instagram" | "tiktok";

export type PostSnapshot = {
  externalId: string;
  title: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  mediaType: string | null;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
};

export type ProfileSnapshot = {
  externalId: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  followers: number | null;
  totalViews: number | null;
  mediaCount: number | null;
  posts: PostSnapshot[];
};

/** Contexto de autenticación (p. ej. Instagram: la cuenta business conectada cuyo token se usa). */
export type ProviderContext = { igUserId?: string; accessToken?: string };

export interface PublicDataProvider {
  id: string;
  platform: CompetitorPlatform;
  /** "official" = API oficial; "coming_soon" = sin API oficial disponible todavía. */
  availability: "official" | "coming_soon";
  /** ¿Necesita una cuenta conectada del proyecto? (Instagram Business Discovery). */
  needsConnectedAccount: boolean;
  /** Créditos por consulta (0 = incluido). */
  creditsPerFetch: number;
  isConfigured(): boolean;
  /** Busca un perfil a partir de lo que escribe el usuario (URL, @handle o ID). */
  lookup(input: string, ctx: ProviderContext): Promise<ProfileSnapshot>;
  /** Refresca un perfil ya seguido. */
  refresh(ref: { externalId: string; handle: string | null }, ctx: ProviderContext): Promise<ProfileSnapshot>;
}
