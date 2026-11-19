import { NextResponse, type NextRequest } from "next/server";
import { emailHash, readReportToken } from "@/lib/reports/link";
import { reportMessages } from "@/lib/reports/render";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Baja en un clic de los informes programados.
 *  - POST (botón de la página o cliente de correo con List-Unsubscribe-Post, RFC 8058): da de baja.
 *  - GET: página de confirmación con un botón (los escáneres de enlaces del correo no dan de baja sin querer).
 * Se quita el email de la programación y se guarda su hash en la lista de bajas del workspace (no se puede volver a añadir).
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(locale: "es" | "en", body: string, form?: string) {
  const m = reportMessages(locale).unsubscribe;
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(m.title)}</title></head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#F4F5F2;color:#11140C">
<main style="max-width:480px;margin:64px auto;padding:28px;background:#fff;border:1px solid #D5DBC7;border-radius:6px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(m.title)}</h1><p style="line-height:1.5;color:#3B4234">${esc(body)}</p>${form ?? ""}</main></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

async function load(t: string | null) {
  const tok = readReportToken(t);
  if (!tok || tok.k !== "unsub") return null;
  const db = createAdminClient();
  if (!db) return null;
  const { data: s } = await db.from("report_schedules").select("id, workspace_id, recipients, locale").eq("id", tok.s).maybeSingle();
  return { tok, db, s };
}

export async function GET(request: NextRequest) {
  const t = request.nextUrl.searchParams.get("t");
  const r = await load(t);
  const locale = r?.s?.locale === "en" ? "en" : "es";
  const m = reportMessages(locale).unsubscribe;
  if (!r) return page(locale, m.invalid);
  const form = `<form method="post" action="/api/reports/unsubscribe?t=${esc(encodeURIComponent(t!))}"><button type="submit" style="background:#11140C;color:#fff;border:0;border-radius:999px;padding:12px 20px;font-weight:bold;cursor:pointer">${esc(m.confirm)}</button></form>`;
  return page(locale, m.body, form);
}

export async function POST(request: NextRequest) {
  const r = await load(request.nextUrl.searchParams.get("t"));
  const locale = r?.s?.locale === "en" ? "en" : "es";
  const m = reportMessages(locale).unsubscribe;
  if (!r) return page(locale, m.invalid);
  const { tok, db, s } = r;
  if (s) {
    const remaining = s.recipients.filter((e) => emailHash(e) !== tok.e);
    await db.from("report_unsubscribes").upsert({ workspace_id: s.workspace_id, email_hash: tok.e }, { onConflict: "workspace_id,email_hash" });
    if (remaining.length !== s.recipients.length) {
      // Si no queda nadie, la programación se desactiva (la tabla exige al menos un destinatario).
      if (remaining.length) await db.from("report_schedules").update({ recipients: remaining }).eq("id", s.id);
      else await db.from("report_schedules").update({ active: false }).eq("id", s.id);
    }
    await db.from("activity_log").insert({ workspace_id: s.workspace_id, action: "report.unsubscribed", entity_type: "report_schedule", entity_id: s.id, metadata: {} });
  }
  return page(locale, m.done);
}
