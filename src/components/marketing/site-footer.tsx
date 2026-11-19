import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { KreoLogo } from "@/components/brand/logo";
import { CookiePreferencesButton } from "./cookie-preferences-button";
import { NAV_LINKS } from "./nav-links";

const LEGAL_LINKS = [
  { href: "/legal/privacidad", key: "privacy" },
  { href: "/legal/terminos", key: "terms" },
  { href: "/legal/cookies", key: "cookies" },
  { href: "/legal/aviso-legal", key: "notice" },
  { href: "/legal/afiliados", key: "affiliates" },
] as const;

const linkClass =
  "rounded-sm text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

export async function SiteFooter() {
  const t = await getTranslations("landing.footer");
  const nav = await getTranslations("landing.nav");
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-card/40">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-8">
        <div className="space-y-3">
          <Link
            href="/"
            aria-label={nav("home")}
            className="inline-block rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <KreoLogo className="h-6" />
          </Link>
          <p className="max-w-xs text-sm text-muted-foreground">{t("tagline")}</p>
        </div>

        <nav aria-labelledby="footer-product">
          <h2 id="footer-product" className="label-mono mb-3">
            {t("product")}
          </h2>
          <ul className="space-y-2">
            {NAV_LINKS.map((l) => (
              <li key={l.key}>
                <Link href={l.href} className={linkClass}>
                  {nav(l.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-resources">
          <h2 id="footer-resources" className="label-mono mb-3">
            {t("resources")}
          </h2>
          <ul className="space-y-2">
            <li>
              <Link href="/blog" className={linkClass}>
                {t("blog")}
              </Link>
            </li>
            <li>
              <Link href="/login" className={linkClass}>
                {nav("login")}
              </Link>
            </li>
            <li>
              <CookiePreferencesButton>{t("cookiePrefs")}</CookiePreferencesButton>
            </li>
          </ul>
        </nav>

        <nav aria-labelledby="footer-legal">
          <h2 id="footer-legal" className="label-mono mb-3">
            {t("legal")}
          </h2>
          <ul className="space-y-2">
            {LEGAL_LINKS.map((l) => (
              <li key={l.key}>
                <Link href={l.href} className={linkClass}>
                  {t(l.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto w-full max-w-6xl px-4 py-6 font-mono text-xs text-muted-foreground sm:px-6 lg:px-8">
          {t("rights", { year })}
        </p>
      </div>
    </footer>
  );
}
