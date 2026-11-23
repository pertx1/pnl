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
  if (!res.ok || body === null) {
    const detail = platformErrorDetail(body);
    // Solo el código de error de la plataforma (nunca tokens ni datos del usuario), para poder diagnosticar.
    console.error(`[${platform}] ${code} http=${res.status}${detail ? ` detail=${detail}` : ""}`);
    throw new PlatformError(platform, detail ? `${code}:${detail}` : code, res.status);
  }
  return body;
}

/** Código de error que devuelve la plataforma (TikTok `error.code`, Google `error.errors[0].reason`, Meta `error.code/subcode`). */
export function platformErrorDetail(body: unknown): string | null {
  const e = (body as { error?: { code?: unknown; error_subcode?: unknown; errors?: { reason?: unknown }[]; status?: unknown } } | null)?.error;
  if (!e) return null;
  const raw = e.errors?.[0]?.reason ?? (typeof e.code === "string" ? e.code : e.error_subcode ? `${e.code}_${e.error_subcode}` : (e.status ?? e.code));
  const clean = String(raw ?? "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 80);
  return clean && clean !== "ok" ? clean : null;
}
