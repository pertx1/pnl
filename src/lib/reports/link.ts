import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Enlaces firmados de los informes (HMAC-SHA256 con una subclave derivada de TOKEN_ENCRYPTION_KEY):
 *  - descarga del PDF de un envío programado (caduca a los 14 días),
 *  - baja en un clic de un destinatario (no caduca; solo sirve para ese email y esa programación).
 * No llevan datos personales en claro salvo el hash del email.
 */

export type DownloadToken = { k: "dl"; s: string; from: string; to: string; exp: number };
export type UnsubscribeToken = { k: "unsub"; s: string; e: string };

function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY no configurada");
  return createHmac("sha256", Buffer.from(raw, "base64")).update("kreo:report-links").digest();
}

export function emailHash(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function signReportToken(payload: DownloadToken | UnsubscribeToken): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readReportToken(token: string | null | undefined): DownloadToken | UnsubscribeToken | null {
  if (!token || token.length > 2000) return null;
  const i = token.lastIndexOf(".");
  if (i < 1) return null;
  const body = token.slice(0, i);
  let expected: Buffer;
  try {
    expected = Buffer.from(createHmac("sha256", key()).update(body).digest("base64url"));
  } catch {
    return null;
  }
  const got = Buffer.from(token.slice(i + 1));
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DownloadToken | UnsubscribeToken;
    if (p.k === "dl" && (typeof p.exp !== "number" || p.exp < Date.now())) return null;
    return p.k === "dl" || p.k === "unsub" ? p : null;
  } catch {
    return null;
  }
}
