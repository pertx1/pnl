"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";
import { NAV_LINKS } from "./nav-links";
import { MarketingThemeToggle } from "./theme-toggle";

/** Menú desplegable para móvil y tablet (< lg). Se cierra con Escape, al pulsar un enlace o fuera. */
export function MobileMenu() {
  const t = useTranslations("landing.nav");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="lg:hidden">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? t("closeMenu") : t("openMenu")}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X aria-hidden /> : <Menu aria-hidden />}
      </Button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-border bg-background shadow-lg"
      >
        <nav aria-label={t("primary")} className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <ul className="grid gap-1">
            {NAV_LINKS.map((l) => (
              <li key={l.key}>
                <Link
                  href={l.href}
                  onClick={close}
                  className="block rounded-md px-3 py-2.5 text-base font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {t(l.key)}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/blog"
                onClick={close}
                className="block rounded-md px-3 py-2.5 text-base font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {t("blog")}
              </Link>
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button asChild variant="outline">
              <Link href="/login" onClick={close}>
                {t("login")}
              </Link>
            </Button>
            <LocaleSwitcher />
            <MarketingThemeToggle />
          </div>
        </nav>
      </div>
    </div>
  );
}
