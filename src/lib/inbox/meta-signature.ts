import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verificación de la cabecera X-Hub-Signature-256 de los webhooks de Meta:
 * "sha256=" + HMAC-SHA256(cuerpo crudo, App Secret) en hexadecimal.
 * Se calcula sobre el cuerpo TAL CUAL llega (Meta lo envía con Unicode escapado).
 * Docs: https://developers.facebook.com/docs/messenger-platform/webhooks
 */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const got = header.slice("sha256=".length).toLowerCase();
  if (got.length !== expected.length || !/^[0-9a-f]+$/.test(got)) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(got, "utf8"));
}

/** Comprobación del "verify token" en la suscripción del webhook (GET con hub.*). */
export function verifySubscription(params: URLSearchParams, verifyToken: string): string | null {
  if (!verifyToken) return null;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token") ?? "";
  const challenge = params.get("hub.challenge");
  if (mode !== "subscribe" || !challenge) return null;
  const a = Buffer.from(token);
  const b = Buffer.from(verifyToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return challenge;
}

/**
 * Firma válida con ALGUNO de los secretos (vacíos ignorados). Con Instagram Login, Meta puede firmar con el
 * «Instagram app secret» (Instagram → API setup with Instagram login → Business login settings) en lugar del
 * App Secret de Configuración → Básica: la doc solo dice "your app's App Secret", así que aceptamos los dos.
 */
export function verifyMetaSignatureAny(rawBody: string, header: string | null, secrets: (string | undefined | null)[]): boolean {
  return secrets.some((s) => Boolean(s) && verifyMetaSignature(rawBody, header, s!));
}

/** appsecret_proof para llamadas a la Graph API (protege el token si se filtrase). */
export function appSecretProof(accessToken: string, appSecret: string) {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}
