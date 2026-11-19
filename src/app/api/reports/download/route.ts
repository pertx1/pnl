import { NextResponse, type NextRequest } from "next/server";
import { readReportToken } from "@/lib/reports/link";
import { buildReportPdf, reportFileName } from "@/lib/reports/render";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Descarga desde el enlace FIRMADO del email programado (sin sesión: los destinatarios son terceros).
 * El token caduca a los 14 días y solo sirve para esa programación y ese periodo. Si la programación se borra o
 * desactiva, el enlace deja de funcionar.
 */
export async function GET(request: NextRequest) {
  const tok = readReportToken(request.nextUrl.searchParams.get("t"));
  if (!tok || tok.k !== "dl") return new NextResponse("Link expired or invalid / Enlace caducado o no válido", { status: 410 });
  const db = createAdminClient();
  if (!db) return new NextResponse("not_configured", { status: 503 });
  const { data: s } = await db.from("report_schedules").select("project_id, locale, include_sales, show_footer, active").eq("id", tok.s).maybeSingle();
  if (!s || !s.active) return new NextResponse("Link expired or invalid / Enlace caducado o no válido", { status: 410 });

  const period = { since: tok.from, until: tok.to };
  const pdf = await buildReportPdf(db, { projectId: s.project_id, period, locale: s.locale === "en" ? "en" : "es", includeSales: s.include_sales, showFooter: s.show_footer });
  if (!pdf) return new NextResponse("not_found", { status: 404 });
  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${reportFileName(pdf.projectName, period)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
