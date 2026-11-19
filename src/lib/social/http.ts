import "server-only";
import { PlatformError, type Platform } from "./types";

/**
 * fetch con timeout y reintentos con backoff exponencial SOLO para errores transitorios (429/5xx/red).
 * Nunca reintenta en bucle: máx. 3 intentos. Respeta Retry-After.
 */
export async function platformFetch(platform: Platform, url: string, init: RequestInit = {}, attempts = 3): Promise<Response> {
  let lastStatus: number | undefined;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000), cache: "no-store" });
      if (res.status !== 429 && res.status < 500) return res;
      lastStatus = res.status;
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : 500 * 2 ** i;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, wait));
    } catch {
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw new PlatformError(platform, lastStatus === 429 ? "rate_limited" : "unavailable", lastStatus);
}

export async function jsonOrThrow<T>(platform: Platform, res: Response, code = "bad_response"): Promise<T> {
  const body = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || body === null) throw new PlatformError(platform, code, res.status);
  return body;
}
