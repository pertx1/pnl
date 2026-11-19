/**
 * Utilidades de email (puras, sin dependencias): respuesta RFC 2822 para Gmail, parseo de cuerpos y direcciones.
 * Gmail: para que la respuesta quede en el mismo hilo hay que enviar `threadId`, `In-Reply-To`/`References`
 * y el mismo asunto. https://developers.google.com/workspace/gmail/api/guides/sending
 */

/** Quita saltos de línea de un valor de cabecera (evita inyección de cabeceras). */
export function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** Codifica una cabecera con RFC 2047 si no es ASCII. */
export function encodeHeader(value: string) {
  const clean = sanitizeHeader(value);
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

export function replySubject(subject: string | null | undefined) {
  const s = sanitizeHeader(subject ?? "");
  if (!s) return "Re:";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

export function toBase64Url(s: string) {
  return Buffer.from(s, "utf8").toString("base64url");
}

export function fromBase64Url(s: string) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** "Nombre <a@b.com>" → { name, email }. */
export function parseAddress(raw: string | null | undefined): { name: string | null; email: string | null } {
  if (!raw) return { name: null, email: null };
  const first = raw.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)[0]?.trim() ?? "";
  const m = first.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  const email = first.match(/[^\s<>"]+@[^\s<>"]+/)?.[0]?.toLowerCase() ?? null;
  return { name: null, email };
}

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
export function isValidEmail(email: string | null | undefined): email is string {
  return Boolean(email && email.length <= 320 && EMAIL_RE.test(email));
}

/** Construye un mensaje MIME de respuesta en texto plano (UTF-8, base64). */
export function buildReplyMime(o: { to: string; subject: string; inReplyTo?: string | null; references?: string | null; body: string }) {
  if (!isValidEmail(o.to)) throw new Error("invalid_recipient");
  const headers = [
    `To: ${sanitizeHeader(o.to)}`,
    `Subject: ${encodeHeader(replySubject(o.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const inReplyTo = o.inReplyTo ? sanitizeHeader(o.inReplyTo) : "";
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
    const refs = [o.references ? sanitizeHeader(o.references) : "", inReplyTo].filter(Boolean).join(" ").trim();
    headers.push(`References: ${refs}`);
  }
  const body = Buffer.from(o.body.replace(/\r?\n/g, "\r\n"), "utf8")
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n");
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
export function decodeEntities(s: string) {
  return s
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e: string) => ENTITIES[e] ?? "")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

/** HTML → texto plano (para mostrar y para el contexto de la IA; nunca se renderiza HTML del remitente). */
export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Quita el texto citado de respuestas anteriores ("El … escribió:", "On … wrote:", líneas con ">"). */
export function stripQuoted(text: string) {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*(On .+wrote:|El .+escribió:|-----\s*Original Message\s*-----|De: .+|From: .+)\s*$/i.test(line) && out.length > 0) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };

/** Extrae el texto de un mensaje de Gmail (prefiere text/plain; si no, text/html convertido). */
export function extractGmailText(payload: GmailPart | undefined): string {
  if (!payload) return "";
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (p: GmailPart) => {
    if (p.mimeType === "text/plain" && p.body?.data) plain.push(fromBase64Url(p.body.data));
    else if (p.mimeType === "text/html" && p.body?.data) html.push(fromBase64Url(p.body.data));
    p.parts?.forEach(walk);
  };
  walk(payload);
  if (plain.length) return plain.join("\n").trim();
  if (html.length) return htmlToText(html.join("\n"));
  return "";
}

export function header(headers: { name: string; value: string }[] | undefined, name: string) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

/** Recorta un texto a `max` caracteres. */
export function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
