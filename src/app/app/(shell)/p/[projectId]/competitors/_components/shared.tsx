"use client";

import { useTranslations } from "next-intl";

/** Traduce un código de error de las acciones del módulo (nunca mostramos mensajes crudos de las APIs). */
export function useResearchError() {
  const t = useTranslations("research.errors");
  return (code?: string) => (code && t.has(code) ? t(code) : t("generic"));
}

/** Atribución obligatoria donde se muestran datos de YouTube (Developer Policies III.A.1, III.A.2.c, III.F.2.a). */
export function YouTubeAttribution({ className }: { className?: string }) {
  const t = useTranslations("research.youtube");
  return (
    <p className={className ?? "flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"}>
      <span className="inline-flex items-center gap-1 rounded-sm bg-[#FF0000] px-1.5 py-px font-semibold text-white">▶ YouTube</span>
      <span>{t("source")}</span>
      <a className="underline underline-offset-2 hover:text-foreground" href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">
        {t("terms")}
      </a>
      <span aria-hidden>·</span>
      <a className="underline underline-offset-2 hover:text-foreground" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
        {t("privacy")}
      </a>
    </p>
  );
}
