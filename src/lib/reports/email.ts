import "server-only";
import { sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { periodFor, type Frequency } from "./core";
import { emailHash, signReportToken } from "./link";
import { periodLabel, reportMessages, type ReportLocale } from "./render";

/**
 * Envío de un informe programado a los destinatarios del cliente (terceros).
 * El proveedor actual de `sendEmail` no admite adjuntos → se envía un ENLACE FIRMADO de descarga que caduca en 14 días.
 * Cada email dice quién lo envía, por qué lo recibe y cómo darse de baja en un clic (List-Unsubscribe + RFC 8058).
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");

export const DOWNLOAD_TTL_DAYS = 14;

function template(opts: { title: string; lines: string[]; cta: { label: string; url: string }; footer: string; unsubscribe: { label: string; url: string }; color: string }) {
  const html = `<!doctype html><html><body style="margin:0;background:#F4F5F2;font-family:Arial,Helvetica,sans-serif;color:#11140C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#FFFFFF;border:1px solid #D5DBC7;border-radius:6px">
<tr><td style="height:4px;background:${esc(opts.color)};border-radius:6px 6px 0 0"></td></tr>
<tr><td style="padding:28px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(opts.title)}</h1>
${opts.lines.map((p) => `<p style="font-size:15px;line-height:1.5;color:#3B4234;margin:0 0 12px">${esc(p)}</p>`).join("")}
<p style="margin:24px 0"><a href="${esc(opts.cta.url)}" style="background:#11140C;color:#FFFFFF;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:4px;display:inline-block">${esc(opts.cta.label)}</a></p>
<p style="font-size:12px;line-height:1.5;color:#5D6654;margin:24px 0 0">${esc(opts.footer)} <a href="${esc(opts.unsubscribe.url)}" style="color:#5D6654">${esc(opts.unsubscribe.label)}</a></p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [opts.title, "", ...opts.lines, "", `${opts.cta.label}: ${opts.cta.url}`, "", opts.footer, `${opts.unsubscribe.label}: ${opts.unsubscribe.url}`].join("\n");
  return { html, text };
}

export async function sendScheduledReport(scheduleId: string, now = new Date()) {
  const db = createAdminClient();
  if (!db) throw new Error("not_configured");
  const { data: s } = await db
    .from("report_schedules")
    .select("id, workspace_id, project_id, frequency, recipients, sender_name, locale, active")
    .eq("id", scheduleId)
    .maybeSingle();
  if (!s || !s.active) return { sent: 0 };
  const locale = (s.locale === "en" ? "en" : "es") as ReportLocale;
  const m = reportMessages(locale).email;
  const period = periodFor(s.frequency as Frequency, now);
  const { data: project } = await db.from("projects").select("name").eq("id", s.project_id).maybeSingle();
  const projectName = project?.name ?? "";

  const { data: kit } = await db.from("brand_kits").select("colors").eq("project_id", s.project_id).maybeSingle();
  const hex = Array.isArray(kit?.colors) ? (kit.colors as { hex?: string }[])[0]?.hex : undefined;
  const color = typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#4A7300";

  const { data: unsubs } = await db.from("report_unsubscribes").select("email_hash").eq("workspace_id", s.workspace_id);
  const blocked = new Set((unsubs ?? []).map((u) => u.email_hash));

  const dl = signReportToken({ k: "dl", s: s.id, from: period.since, to: period.until, exp: Date.now() + DOWNLOAD_TTL_DAYS * 86400000 });
  const downloadUrl = `${appUrl()}/api/reports/download?t=${encodeURIComponent(dl)}`;
  const vars = { project: projectName, sender: s.sender_name, period: periodLabel(period, locale), days: String(DOWNLOAD_TTL_DAYS) };

  let sent = 0;
  for (const to of s.recipients) {
    const h = emailHash(to);
    if (blocked.has(h)) continue;
    const unsubscribeUrl = `${appUrl()}/api/reports/unsubscribe?t=${encodeURIComponent(signReportToken({ k: "unsub", s: s.id, e: h }))}`;
    const { html, text } = template({
      title: fill(m.subject, vars),
      lines: [fill(m.intro, vars), fill(m.linkNote, vars)],
      cta: { label: m.cta, url: downloadUrl },
      footer: fill(m.footer, vars),
      unsubscribe: { label: m.unsubscribe, url: unsubscribeUrl },
      color,
    });
    const r = await sendEmail({ to, subject: fill(m.subject, vars), html, text, unsubscribeUrl });
    if (r.ok) sent++;
  }
  await db.from("report_schedules").update({ last_sent_at: new Date().toISOString() }).eq("id", s.id);
  await db.from("activity_log").insert({ workspace_id: s.workspace_id, action: "report.sent", entity_type: "report_schedule", entity_id: s.id, metadata: { recipients: sent } });
  return { sent };
}
