/** Parseo de entradas del usuario (funciones puras, testeables). Nunca se hace fetch aquí. */

export type YouTubeRef = { kind: "handle"; value: string } | { kind: "id"; value: string };

/** Acepta: @handle, handle, https://youtube.com/@handle, https://www.youtube.com/channel/UC… o un ID UC…. */
export function parseYouTubeInput(raw: string): YouTubeRef | null {
  const s = raw.trim();
  if (!s) return null;
  const idRe = /^UC[\w-]{22}$/;
  if (idRe.test(s)) return { kind: "id", value: s };
  let path = s;
  if (/^https?:\/\//i.test(s) || /^(www\.|m\.)?youtube\.com\//i.test(s)) {
    try {
      const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
      if (!/(^|\.)youtube\.com$/i.test(u.hostname)) return null;
      path = decodeURIComponent(u.pathname);
    } catch {
      return null;
    }
    const ch = path.match(/^\/channel\/(UC[\w-]{22})/);
    if (ch) return { kind: "id", value: ch[1] };
    const h = path.match(/^\/@([\w.\-·]{3,100})/);
    if (h) return { kind: "handle", value: `@${h[1]}` };
    return null;
  }
  const handle = s.replace(/^@/, "");
  if (/^[\w.\-·]{3,100}$/.test(handle)) return { kind: "handle", value: `@${handle}` };
  return null;
}

/** Usuario de Instagram (business/creator): @usuario, usuario o https://instagram.com/usuario. */
export function parseInstagramInput(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s) || /^(www\.)?instagram\.com\//i.test(s)) {
    try {
      const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
      if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null;
      s = u.pathname.split("/").filter(Boolean)[0] ?? "";
    } catch {
      return null;
    }
  }
  const user = s.replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(user) ? user : null;
}

export function parseTikTokInput(raw: string): string | null {
  let s = raw.trim();
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (!/(^|\.)tiktok\.com$/i.test(u.hostname)) return null;
      s = u.pathname.split("/").filter(Boolean)[0] ?? "";
    } catch {
      return null;
    }
  }
  const user = s.replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._]{2,24}$/.test(user) ? user : null;
}

export type SwipeNetwork = "youtube" | "tiktok" | "instagram" | "facebook" | "other";

/** Solo https y sin credenciales/puertos raros. Devuelve la URL normalizada o null. */
export function safeHttpsUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
    if (!u.hostname.includes(".")) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

export function detectNetwork(url: string): SwipeNetwork {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return "youtube";
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(facebook\.com|fb\.watch)$/.test(host)) return "facebook";
  return "other";
}

/** Normaliza etiquetas: minúsculas, sin #, sin duplicados, máx. 20 de 30 caracteres. */
export function normalizeTags(raw: string | string[]): string[] {
  const list = Array.isArray(raw) ? raw : raw.split(/[,\n]/);
  const out: string[] = [];
  for (const t of list) {
    const v = t.trim().replace(/^#/, "").toLowerCase().slice(0, 30);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= 20) break;
  }
  return out;
}

/** País UE/EEE válido para la Ad Library (ISO 3166-1 alfa-2). */
export const EU_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
] as const;
export type EuCountry = (typeof EU_COUNTRIES)[number];
