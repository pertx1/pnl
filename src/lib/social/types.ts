export type Platform = "tiktok" | "instagram" | "youtube";
export const PLATFORMS: Platform[] = ["tiktok", "instagram", "youtube"];

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  accessExpiresAt?: Date;
  refreshExpiresAt?: Date;
  grantedScopes: string[];
};

/** Una cuenta conectable (en Instagram, un mismo login puede dar varias cuentas business/creator). */
export type ConnectedProfile = {
  externalId: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  metadata?: Record<string, unknown>;
  /** Token específico de esta cuenta, si difiere del general (no usado de momento). */
  tokens?: TokenSet;
};

export type ProfileStats = { followers?: number; views?: number; likes?: number; posts?: number };

/**
 * Contrato de cada plataforma. SOLO APIs oficiales y OAuth oficial (sección 0 del brief).
 * Nada de acciones de engagement: no hay métodos para seguir, dar like, comentar ni enviar DMs.
 */
export interface PlatformAdapter {
  id: Platform;
  /** Permisos que pedimos (mínimos y justificados en docs/developer-accounts.md). */
  scopes: string[];
  /** ¿Están las credenciales de la app configuradas en el entorno? */
  isConfigured(): boolean;
  usesPkce: boolean;
  authorizeUrl(opts: { state: string; redirectUri: string; codeChallenge?: string }): string;
  exchangeCode(opts: { code: string; redirectUri: string; codeVerifier?: string }): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  revoke(accessToken: string): Promise<void>;
  fetchProfiles(tokens: TokenSet): Promise<ConnectedProfile[]>;
  fetchStats(tokens: TokenSet, profile: { externalId: string; metadata: Record<string, unknown> }): Promise<ProfileStats>;
}

export class PlatformError extends Error {
  constructor(
    public platform: Platform,
    public code: string,
    public status?: number,
  ) {
    super(`${platform}:${code}`);
  }
}
