import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { KreoLogo } from "@/components/brand/logo";

// Textos legales en redacción (Fase 1). Deben pasar revisión de un abogado antes del lanzamiento público.
const PAGES = { privacidad: "privacy", terminos: "terms", cookies: "cookies", "aviso-legal": "notice" } as const;
type Slug = keyof typeof PAGES;

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug }));
}

export default async function LegalPage({ params }: PageProps<"/legal/[slug]">) {
  const { slug } = await params;
  if (!(slug in PAGES)) notFound();
  const t = await getTranslations("legal");
  const key = PAGES[slug as Slug];
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Link href="/" aria-label="Kreo">
        <KreoLogo className="h-6" />
      </Link>
      <p role="note" className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-warning">
        {t("draftBanner")}
      </p>
      <h1 className="text-3xl font-bold">{t(key)}</h1>
      <p className="text-muted-foreground">—</p>
    </div>
  );
}
