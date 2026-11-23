/**
 * Caducidad del permiso de YouTube mientras la app de Google esté «En prueba» (Testing):
 * Google caduca el refresh token a los 7 días del consentimiento
 * (https://developers.google.com/identity/protocols/oauth2#expiration). Avisamos 2 días antes.
 * Cuando Google apruebe la app (estado «En producción»), poner GOOGLE_OAUTH_IN_PRODUCTION=true y no se avisa más.
 * Lógica pura: tests en tests/unit/notifications.test.ts.
 */
export const YT_TESTING_TOKEN_DAYS = 7;
export const YT_WARN_DAYS_BEFORE = 2;
const DAY = 86_400_000;

export function googleOAuthInTesting(env: Record<string, string | undefined> = process.env) {
  return env.GOOGLE_OAUTH_IN_PRODUCTION !== "true";
}

export type ConsentStatus =
  | { state: "ok"; expiresAt: Date; warnFrom: Date }
  | { state: "expiring"; expiresAt: Date; warnFrom: Date }
  | { state: "expired"; expiresAt: Date; warnFrom: Date };

/**
 * `consentAt`: último consentimiento (conexión o reconexión). Si el token guardado trae una caducidad explícita del
 * refresh token (`refreshExpiresAt`), manda esa.
 */
export function youtubeConsentStatus(consentAt: Date, now: Date, refreshExpiresAt?: Date | null): ConsentStatus {
  const expiresAt = refreshExpiresAt ?? new Date(consentAt.getTime() + YT_TESTING_TOKEN_DAYS * DAY);
  const warnFrom = new Date(expiresAt.getTime() - YT_WARN_DAYS_BEFORE * DAY);
  if (now >= expiresAt) return { state: "expired", expiresAt, warnFrom };
  if (now >= warnFrom) return { state: "expiring", expiresAt, warnFrom };
  return { state: "ok", expiresAt, warnFrom };
}

/** Último consentimiento: la entrada más reciente de conexión/reconexión; si no hay, la fecha de alta de la cuenta. */
export function lastConsentAt(createdAt: string, activity: { action: string; created_at: string }[]): Date {
  const times = activity
    .filter((a) => a.action === "social_account.connected" || a.action === "social_account.reconnected")
    .map((a) => new Date(a.created_at).getTime())
    .filter((t) => Number.isFinite(t));
  const created = new Date(createdAt).getTime();
  return new Date(Math.max(created, ...times));
}

/** Clave de deduplicación: un aviso por cuenta y por consentimiento (al reconectar cambia y se vuelve a avisar). */
export function consentDedupeKey(accountId: string, consentAt: Date) {
  return `yt_consent:${accountId}:${consentAt.toISOString().slice(0, 16)}`;
}
