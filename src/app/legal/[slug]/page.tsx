import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { KreoLogo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Markdown } from "@/components/markdown";

// Textos legales en BORRADOR (content/legal/{es,en}/*.md). Deben pasar revisión de un abogado antes del lanzamiento.
const SLUGS = ["privacidad", "terminos", "cookies", "aviso-legal", "afiliados"] as const;
type Slug = (typeof SLUGS)[number];

export function generateStaticParams() {
  return SLUGS.map((slug) => ({ slug }));
}

async function load(slug: Slug, locale: string) {
  const file = path.join(process.cwd(), "content", "legal", locale === "en" ? "en" : "es", `${slug}.md`);
  return readFile(file, "utf8");
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUGS.includes(slug as Slug)) return {};
  const md = await load(slug as Slug, await getLocale());
  const title = md.match(/^#\s+(.+)$/m)?.[1] ?? slug;
  return { title };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUGS.includes(slug as Slug)) notFound();
  const t = await getTranslations("legal");
  const md = await load(slug as Slug, await getLocale());

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <Link href="/" aria-label="Kreo">
          <KreoLogo className="h-6" />
        </Link>
        <LocaleSwitcher />
      </div>
      <p role="note" className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-warning">
        {t("draftBanner")}
      </p>
      <Markdown>{md}</Markdown>
      <nav className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-6 text-sm text-muted-foreground">
        {SLUGS.map((s) => (
          <Link key={s} href={`/legal/${s}`} className="hover:text-foreground hover:underline" aria-current={s === slug ? "page" : undefined}>
            /{s}
          </Link>
        ))}
      </nav>
    </div>
  );
}
