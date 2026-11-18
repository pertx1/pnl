"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/lib/server/locale-actions";

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          start(async () => {
            await setLocale(next);
            router.refresh();
          });
        }}
        className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs uppercase"
      >
        <option value="es">ES</option>
        <option value="en">EN</option>
      </select>
    </label>
  );
}
