import { createHash, randomBytes } from "node:crypto";

/**
 * API keys personales del servidor MCP. Formato: `kreo_sk_<43 caracteres base64url>` (256 bits de entropía).
 * En la base de datos solo se guarda el hash SHA-256 (hex) y un prefijo visible para reconocerla.
 */
export const KEY_PREFIX = "kreo_sk_";
const KEY_RE = /^kreo_sk_[A-Za-z0-9_-]{43}$/;

export function hashApiKey(key: string) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function generateApiKey() {
  const key = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { key, prefix: key.slice(0, KEY_PREFIX.length + 4), hash: hashApiKey(key) };
}

export function isWellFormedKey(key: string) {
  return KEY_RE.test(key);
}

/** Extrae la clave de "Authorization: Bearer <key>". */
export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(\S+)$/i);
  return m && isWellFormedKey(m[1]) ? m[1] : null;
}

/** Límites por API key (ventanas fijas en Postgres). */
export const RATE_LIMIT = { perMinute: 60, perDay: 2000 } as const;
