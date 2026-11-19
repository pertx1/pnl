import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import en from "../../../messages/modules/commerce/en.json";
import es from "../../../messages/modules/commerce/es.json";
import type { Database } from "@/lib/supabase/database.types";
import { loadReportData } from "./data";
import { renderReportPdf, type PdfLabels } from "./pdf";

/** Genera el PDF de un proyecto y periodo. Los textos salen de messages/modules/commerce (también fuera de una petición, p. ej. en Inngest). */

export type ReportLocale = "es" | "en";

export function reportMessages(locale: ReportLocale) {
  return (locale === "en" ? en : es).commerce;
}

function formatDay(day: string, locale: ReportLocale) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

export function periodLabel(period: { since: string; until: string }, locale: ReportLocale) {
  return `${formatDay(period.since, locale)} – ${formatDay(period.until, locale)}`;
}

export async function buildReportPdf(
  db: SupabaseClient<Database>,
  opts: { projectId: string; period: { since: string; until: string }; locale: ReportLocale; includeSales: boolean; showFooter: boolean },
) {
  const data = await loadReportData(db, opts.projectId, opts.period, opts.includeSales);
  if (!data) return null;
  const m = reportMessages(opts.locale).pdf;
  const labels: PdfLabels = { ...m, period: periodLabel(opts.period, opts.locale) };
  const bytes = await renderReportPdf(data, { labels, locale: opts.locale, showFooter: opts.showFooter });
  return { bytes, projectName: data.project.name, workspaceId: data.project.workspaceId };
}

export function reportFileName(projectName: string, period: { since: string; until: string }) {
  const slug = projectName.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "report";
  return `${slug}-${period.since}_${period.until}.pdf`;
}
