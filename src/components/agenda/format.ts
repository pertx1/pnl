import { useTranslations } from "next-intl";
import { splitMinutes } from "@/lib/agenda/core";

/** «3 h 20 min», «45 min», «2 h». */
export function useDuration() {
  const t = useTranslations("agenda");
  return (minutes: number) => {
    const { h, m } = splitMinutes(minutes);
    if (h && m) return t("durationHm", { h, m });
    if (h) return t("durationH", { h });
    return t("durationM", { m });
  };
}

/** Fecha de calendario (YYYY-MM-DD) como Date a mediodía UTC: se formatea con timeZone "UTC" y nunca cambia de día. */
export const dayDate = (day: string) => new Date(`${day}T12:00:00Z`);
