import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { KreoLogo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";
import { MobileMenu } from "./mobile-menu";
import { NAV_LINKS } from "./nav-links";
import { MarketingThemeToggle } from "./theme-toggle";

export async function SiteHeader() {
  const t = await getTranslations("landing.nav");
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label={t("home")}
          className="shrink-0 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <KreoLogo className="h-6" />
        </Link>

        <nav aria-label={t("primary")} className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <li key={l.key}>
                <Link
                  href={l.href}
                  className="rounded-md px-3 py-2 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {t(l.key)}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/blog"
                className="rounded-md px-3 py-2 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {t("blog")}
              </Link>
            </li>
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 lg:flex">
            <LocaleSwitcher />
            <MarketingThemeToggle />
            <Button asChild variant="ghost">
              <Link href="/login">{t("login")}</Link>
            </Button>
          </div>
          <Button asChild>
            <Link href="/#waitlist">
              <span className="sm:hidden">{t("joinShort")}</span>
              <span className="hidden sm:inline">{t("join")}</span>
            </Link>
          </Button>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
