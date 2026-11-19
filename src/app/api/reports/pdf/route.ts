import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { lastDays } from "@/lib/reports/core";
import { buildReportPdf, reportFileName } from "@/lib/reports/render";
import { createClient } from "@/lib/supabase/server";

/** Descarga inmediata del informe PDF desde la app. Usa la sesión del usuario → RLS (viewer+). No se guarda nada. */
const schema = z.object({
  project: z.uuid(),
  days: z.coerce.number().int().refine((d) => [7, 30, 90].includes(d)),
  sales: z.enum(["0", "1"]).default("1"),
  footer: z.enum(["0", "1"]).default("1"),
  locale: z.enum(["es", "en"]).default("es"),
});

export async function GET(request: NextRequest) {
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return new NextResponse("invalid_input", { status: 400 });
  const q = parsed.data;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse("unauthorized", { status: 401 });

  const period = lastDays(q.days, new Date());
  const pdf = await buildReportPdf(supabase, { projectId: q.project, period, locale: q.locale, includeSales: q.sales === "1", showFooter: q.footer === "1" });
  if (!pdf) return new NextResponse("not_found", { status: 404 });
  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${reportFileName(pdf.projectName, period)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
