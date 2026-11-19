import { describe, expect, it } from "vitest";
import {
  affiliateLink,
  commissionMonths,
  commissionRate,
  computeCommission,
  DEFAULT_COMMISSION_RATE,
  hasMarketingConsent,
  normalizeAffiliateCode,
  parseConsentCookie,
} from "@/lib/affiliates";

const consent = (marketing: boolean) => encodeURIComponent(JSON.stringify({ v: 1, analytics: false, marketing, at: "2026-11-19T00:00:00Z" }));

describe("afiliados", () => {
  it("normaliza y valida códigos", () => {
    expect(normalizeAffiliateCode(" ab12cd34 ")).toBe("AB12CD34");
    expect(normalizeAffiliateCode("abc")).toBeNull();
    expect(normalizeAffiliateCode("AB12CD34<script>")).toBeNull();
    expect(normalizeAffiliateCode(null)).toBeNull();
  });

  it("porcentaje de comisión configurable (por defecto 20 %)", () => {
    expect(commissionRate(undefined)).toBe(DEFAULT_COMMISSION_RATE);
    expect(commissionRate("0.3")).toBe(0.3);
    expect(commissionRate("25")).toBe(0.25);
    expect(commissionRate("25%")).toBe(0.25);
    expect(commissionRate("-1")).toBe(DEFAULT_COMMISSION_RATE);
    expect(commissionRate("95")).toBe(DEFAULT_COMMISSION_RATE);
    expect(commissionRate("abc")).toBe(DEFAULT_COMMISSION_RATE);
  });

  it("duración de la comisión", () => {
    expect(commissionMonths(undefined)).toBe(12);
    expect(commissionMonths("24")).toBe(24);
    expect(commissionMonths("0")).toBe(12);
  });

  it("calcula la comisión en céntimos, redondeando hacia abajo", () => {
    expect(computeCommission(1570, 0.2)).toBe(314);
    expect(computeCommission(999, 0.2)).toBe(199);
    expect(computeCommission(0, 0.2)).toBe(0);
    expect(computeCommission(-5, 0.2)).toBe(0);
  });

  it("consentimiento de marketing desde la cookie (servidor)", () => {
    expect(hasMarketingConsent(consent(true))).toBe(true);
    expect(hasMarketingConsent(consent(false))).toBe(false);
    expect(hasMarketingConsent(JSON.stringify({ v: 1, marketing: true }))).toBe(true);
    expect(hasMarketingConsent(undefined)).toBe(false);
    expect(hasMarketingConsent("basura")).toBe(false);
    expect(hasMarketingConsent(encodeURIComponent(JSON.stringify({ v: 2, marketing: true })))).toBe(false);
    expect(parseConsentCookie(consent(true))).toMatchObject({ v: 1, marketing: true, analytics: false });
  });

  it("enlace de afiliado", () => {
    expect(affiliateLink("https://kreo.app/", "AB12CD34")).toBe("https://kreo.app/r/AB12CD34");
  });
});
