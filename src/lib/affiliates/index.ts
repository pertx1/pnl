/**
 * Programa de afiliados: utilidades puras (sin servidor, testeables).
 * Regla de privacidad: la cookie de atribución `kreo_ref` SOLO se fija con consentimiento de marketing
 * (cookie `kreo_consent`, ver src/lib/consent). Sin consentimiento → `?ref=` declarado en el registro, sin cookie.
 */
import { CONSENT_COOKIE, type Consent } from "@/lib/consent";

export const REF_COOKIE = "kreo_ref";
/** Ventana de atribución PROVISIONAL (debe coincidir con attribute_referral en SQL: 30 días). */
export const ATTRIBUTION_DAYS = 30;
export const REF_COOKIE_MAX_AGE = 60 * 60 * 24 * ATTRIBUTION_DAYS;

/** Porcentaje de comisión recurrente por defecto (PROVISIONAL): 20 %. Configurable con AFFILIATE_COMMISSION_RATE. */
export const DEFAULT_COMMISSION_RATE = 0.2;
/** Duración por defecto de la comisión recurrente (PROVISIONAL): 12 meses. Configurable con AFFILIATE_COMMISSION_MONTHS. */
export const DEFAULT_COMMISSION_MONTHS = 12;

const CODE_RE = /^[A-Z0-9]{6,16}$/;

export function normalizeAffiliateCode(raw: string | null | undefined): string | null {
  const code = (raw ?? "").trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

/** Acepta "0.2", "20" o "20%". Fuera de rango → valor por defecto. */
export function commissionRate(raw: string | undefined = process.env.AFFILIATE_COMMISSION_RATE): number {
  if (!raw) return DEFAULT_COMMISSION_RATE;
  const n = Number.parseFloat(raw.replace("%", "").trim());
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_COMMISSION_RATE;
  const rate = n > 1 ? n / 100 : n;
  return rate > 0 && rate <= 0.9 ? Math.round(rate * 10000) / 10000 : DEFAULT_COMMISSION_RATE;
}

export function commissionMonths(raw: string | undefined = process.env.AFFILIATE_COMMISSION_MONTHS): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 && n <= 120 ? n : DEFAULT_COMMISSION_MONTHS;
}

/** Comisión en céntimos (redondeo hacia abajo, igual que record_commission en SQL). */
export function computeCommission(netCents: number, rate: number): number {
  if (!Number.isFinite(netCents) || netCents <= 0 || rate <= 0) return 0;
  return Math.floor(netCents * rate);
}

/** Parsea el valor (crudo o codificado) de la cookie `kreo_consent` en el servidor. */
export function parseConsentCookie(raw: string | null | undefined): Consent | null {
  if (!raw) return null;
  try {
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // ya venía decodificada
    }
    const parsed = JSON.parse(value) as Partial<Consent>;
    if (parsed?.v !== 1) return null;
    return { v: 1, analytics: parsed.analytics === true, marketing: parsed.marketing === true, at: String(parsed.at ?? "") };
  } catch {
    return null;
  }
}

export function hasMarketingConsent(raw: string | null | undefined): boolean {
  return parseConsentCookie(raw)?.marketing === true;
}

export { CONSENT_COOKIE };

export function affiliateLink(base: string, code: string) {
  return `${base.replace(/\/$/, "")}/r/${code}`;
}
