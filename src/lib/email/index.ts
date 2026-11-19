import "server-only";

/**
 * Capa de email transaccional intercambiable.
 * Proveedor actual: Resend (API REST) si hay RESEND_API_KEY. Sin proveedor:
 *  - en desarrollo se imprime en consola (sin datos sensibles en producción),
 *  - en producción falla de forma controlada (devuelve { ok: false }).
 * Pendiente de decisión de Oier: proveedor definitivo con región UE (Resend / Brevo / Postmark).
 */
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** URL de baja en un clic (cabeceras List-Unsubscribe, RFC 8058). Obligatoria en emails de marketing. */
  unsubscribeUrl?: string;
};

export type SendResult = { ok: true } | { ok: false; reason: "no_provider" | "provider_error" };

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Kreo <hola@example.com>";

  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email:dev] To: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}`);
      return { ok: true };
    }
    console.error("[email] No hay proveedor de email configurado");
    return { ok: false, reason: "no_provider" };
  }

  const headers: Record<string, string> = {};
  if (msg.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${msg.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, headers }),
  });
  if (!res.ok) {
    // No registramos el email del destinatario (logs sin datos personales).
    console.error(`[email] Error del proveedor: ${res.status}`);
    return { ok: false, reason: "provider_error" };
  }
  return { ok: true };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Plantilla mínima con la identidad de Kreo. `paragraphs` en texto plano (se escapan). */
export function layoutEmail(opts: { title: string; paragraphs: string[]; cta?: { label: string; url: string }; footer: string }) {
  const html = `<!doctype html><html><body style="margin:0;background:#0A0C08;font-family:Arial,Helvetica,sans-serif;color:#E9EFE0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#12150E;border:1px solid #272C1F;border-radius:6px">
<tr><td style="padding:28px">
<div style="font-size:22px;font-weight:bold;letter-spacing:-0.5px"><span style="color:#C6F432">&#9698;</span> kreo<span style="color:#C6F432">_</span></div>
<h1 style="font-size:20px;margin:24px 0 12px">${esc(opts.title)}</h1>
${opts.paragraphs.map((p) => `<p style="font-size:15px;line-height:1.5;color:#C9D1BF;margin:0 0 12px">${esc(p)}</p>`).join("")}
${opts.cta ? `<p style="margin:24px 0"><a href="${esc(opts.cta.url)}" style="background:#C6F432;color:#0A0C08;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:4px;display:inline-block">${esc(opts.cta.label)}</a></p>` : ""}
<p style="font-size:12px;line-height:1.5;color:#8A9480;margin:24px 0 0">${opts.footer}</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [opts.title, "", ...opts.paragraphs, "", opts.cta ? `${opts.cta.label}: ${opts.cta.url}` : "", "", opts.footer.replace(/<[^>]+>/g, "")].join("\n");
  return { html, text };
}
