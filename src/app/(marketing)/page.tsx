import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Pricing } from "@/components/marketing/pricing";
import { Trust } from "@/components/marketing/trust";
import { WaitlistSection } from "@/components/marketing/waitlist-section";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing.meta");
  return {
    // absolute: evita el sufijo "· Kreo" de la plantilla del layout raíz (el título ya lo incluye).
    title: { absolute: t("title") },
    description: t("description"),
    openGraph: { title: t("ogTitle"), description: t("ogDescription"), type: "website", siteName: "Kreo" },
  };
}

/** Código de referido de `?ref=`: alfanumérico, máx. 16 (mismo formato que valida joinWaitlist). */
function sanitizeRef(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v) return undefined;
  return /^[A-Za-z0-9]{1,16}$/.test(v) ? v : undefined;
}

export default async function LandingPage({ searchParams }: PageProps<"/">) {
  const refCode = sanitizeRef((await searchParams).ref);
  return (
    <>
      <Hero refCode={refCode} />
      <Features />
      <Trust />
      <HowItWorks />
      <Pricing />
      <Faq />
      <WaitlistSection refCode={refCode} />
    </>
  );
}
