import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Cifrado de tokens OAuth en reposo (AES-256-GCM). Clave: TOKEN_ENCRYPTION_KEY (32 bytes en base64).
 * Formato: v1.<iv>.<tag>.<ciphertext> (base64url). Aunque se filtrase la base de datos, los tokens no son legibles.
 */
function masterKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY no configurada");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY debe tener 32 bytes (base64)");
  return key;
}

/** Subclave derivada para cada uso (cifrado vs. firma de estado OAuth). */
function subkey(label: string): Buffer {
  return createHmac("sha256", masterKey()).update(`kreo:${label}`).digest();
}

export function isCryptoConfigured() {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", subkey("token-encryption"), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptToken(payload: string): string {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Formato de token cifrado no válido");
  const decipher = createDecipheriv("aes-256-gcm", subkey("token-encryption"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Firma HMAC (para el estado OAuth guardado en cookie). */
export function sign(value: string): string {
  const mac = createHmac("sha256", subkey("oauth-state")).update(value).digest("base64url");
  return `${value}.${mac}`;
}

export function verify(signed: string): string | null {
  const i = signed.lastIndexOf(".");
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const expected = Buffer.from(sign(value).slice(i + 1));
  const got = Buffer.from(signed.slice(i + 1));
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  return value;
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}
