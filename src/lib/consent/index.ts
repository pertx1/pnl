/**
 * Consentimiento de cookies (RGPD + LSSI art. 22.2).
 * Cookie `kreo_consent` = JSON { v, analytics, marketing, at }. Ninguna cookie/script no esencial se carga
 * antes de que el usuario acepte su categoría. Usa `hasConsent("analytics")` antes de cargar cualquier script.
 */
export type ConsentCategory = "analytics" | "marketing";
export type Consent = { v: 1; analytics: boolean; marketing: boolean; at: string };

export const CONSENT_COOKIE = "kreo_consent";
export const CONSENT_EVENT = "kreo:consent-changed";
export const OPEN_PREFERENCES_EVENT = "kreo:open-cookie-preferences";

export function readConsent(): Consent | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`))?.split("=")[1];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Consent;
    return parsed.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function writeConsent(c: Omit<Consent, "v" | "at">) {
  const value: Consent = { v: 1, ...c, at: new Date().toISOString() };
  // 6 meses: periodo razonable antes de volver a preguntar (criterio AEPD).
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(value))}; Path=/; Max-Age=${60 * 60 * 24 * 182}; SameSite=Lax; Secure`;
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
}

export function hasConsent(category: ConsentCategory) {
  return readConsent()?.[category] === true;
}
