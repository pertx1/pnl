"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/** Conmutador claro/oscuro con etiqueta traducida (el de src/components aún tiene el texto fijo en español). */
export function MarketingThemeToggle() {
  const t = useTranslations("landing.nav");
  const { resolvedTheme, systemTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        const next = resolvedTheme === "dark" ? "light" : "dark";
        setTheme(next === systemTheme ? "system" : next);
      }}
      aria-label={t("theme")}
    >
      <Sun className="hidden dark:block" aria-hidden />
      <Moon className="dark:hidden" aria-hidden />
    </Button>
  );
}
