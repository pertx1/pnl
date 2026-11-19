import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CONSENT_COOKIE, hasMarketingConsent, normalizeAffiliateCode, REF_COOKIE } from "./index";

/** Código de la cookie de atribución, solo si el usuario SIGUE dando consentimiento de marketing. */
export async function getConsentedRefCode(): Promise<string | null> {
  const store = await cookies();
  if (!hasMarketingConsent(store.get(CONSENT_COOKIE)?.value)) return null;
  return normalizeAffiliateCode(store.get(REF_COOKIE)?.value);
}

/**
 * Aplica la cookie consentida al usuario actual (idempotente: si ya tiene atribución, no hace nada).
 * Se llama en momentos de intención (p. ej. antes de contratar un plan). Nunca lanza.
 */
export async function applyConsentedReferral(): Promise<void> {
  const code = await getConsentedRefCode();
  if (!code) return;
  try {
    const supabase = await createClient();
    await supabase.rpc("claim_referral", { p_code: code, p_source: "cookie" });
  } catch {
    // La atribución nunca debe bloquear un pago.
  }
}

/** Personal de Kreo que puede marcar comisiones como pagadas (lista de emails en KREO_STAFF_EMAILS). */
export function isStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.KREO_STAFF_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
