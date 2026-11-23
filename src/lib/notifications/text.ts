/**
 * Textos de los avisos generados en el servidor (Inngest), en el idioma del destinatario.
 * Lógica pura (sin servidor): tests en tests/unit/notifications.test.ts.
 * Las plantillas viven en messages/modules/notifications/{es,en}.json (mismas claves que usa la UI).
 * Solo placeholders simples `{nombre}` (sin plurales ICU) para poder rellenarlas aquí y con next-intl.
 */
import en from "../../../messages/modules/notifications/en.json";
import es from "../../../messages/modules/notifications/es.json";

export type NotifyLocale = "es" | "en";
type Msgs = typeof es.notifications;
const MESSAGES: Record<NotifyLocale, Msgs> = { es: es.notifications, en: en.notifications };

export type TemplateKey = keyof Msgs["tpl"];

export const PLATFORM_LABEL: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", gmail: "Gmail", outlook: "Outlook" };

export function fill(template: string, params: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

export function normalizeLocale(l: string | null | undefined): NotifyLocale {
  return l === "en" ? "en" : "es";
}

export function composeText(key: TemplateKey, params: Record<string, string | number>, locale: NotifyLocale) {
  const tpl = MESSAGES[locale].tpl[key];
  // Sin título de publicación u otro dato opcional, se quita el separador sobrante («Motivo · » → «Motivo»).
  const clean = (s: string) => s.replace(/(^\s*·\s+)|(\s+·\s*$)/g, "").trim();
  return { title: clean(fill(tpl.title, params)).slice(0, 200), body: clean(fill(tpl.body, params)).slice(0, 1000) };
}

/**
 * Motivo de un fallo de publicación en lenguaje claro. `code` es el error_code guardado (p. ej. "token_expired",
 * "quotaExceeded" o un fail_reason de TikTok). Nunca se muestra el código crudo de la plataforma.
 */
export function failureReason(code: string | null | undefined, locale: NotifyLocale) {
  const r = MESSAGES[locale].reasons;
  // Los errores reintentables llegan como "plataforma:código" (mensaje de PlatformError).
  const c = (code ?? "").toLowerCase().replace(/^(tiktok|instagram|youtube):/, "");
  if (!c) return r.unknown;
  if (Object.hasOwn(r, c)) return r[c as keyof typeof r];
  if (c.includes("private_accounts") && Object.hasOwn(r, "tiktok_private_account")) return r["tiktok_private_account" as keyof typeof r];
  if (c.includes("quota")) return r.quota;
  if (c.includes("token") || c.includes("auth") || c.includes("scope")) return r.token_expired;
  if (c.includes("rate") || c.includes("spam") || c.includes("frequency")) return r.rate_limited;
  if (c.includes("privacy")) return r.privacy_not_allowed;
  if (c.includes("timeout")) return r.publish_timeout;
  if (c.includes("upload")) return r.upload_failed;
  if (c.includes("format") || c.includes("duration") || c.includes("resolution") || c.includes("media")) return r.media_processing_failed;
  return r.unknown;
}

/** "thumbnail_403,captions_failed" → "miniatura, subtítulos" (solo nombres de pasos, sin códigos). */
export function warningsText(warnings: string[], locale: NotifyLocale) {
  const w = MESSAGES[locale].warnings;
  const names = new Set<string>();
  for (const x of warnings) {
    const step = x.split("_")[0] as keyof typeof w;
    if (Object.hasOwn(w, step)) names.add(w[step]);
  }
  return [...names].join(", ");
}

export function kindLabel(kind: string | null | undefined, locale: NotifyLocale) {
  const k = MESSAGES[locale].kinds;
  return Object.hasOwn(k, kind ?? "") ? k[kind as keyof typeof k] : k.other;
}

/** Texto corto de una publicación para el aviso: título propio del usuario, recortado. */
export function postLabel(title: string | null | undefined, locale: NotifyLocale) {
  const t = (title ?? "").trim();
  if (t) return t.length > 80 ? `${t.slice(0, 79)}…` : t;
  return locale === "en" ? "Untitled post" : "Publicación sin título";
}

export function accountLabel(a: { handle?: string | null; display_name?: string | null; platform?: string | null }) {
  if (a.handle) return `@${a.handle.replace(/^@/, "")}`;
  return a.display_name?.slice(0, 80) || PLATFORM_LABEL[a.platform ?? ""] || "";
}
