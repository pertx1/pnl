import "server-only";
import { InboxError } from "./config";

/**
 * fetch con timeout y reintentos con backoff SOLO para errores transitorios (429/5xx/red). Máx. 3 intentos,
 * respeta Retry-After. Igual que `platformFetch` de src/lib/social/http.ts, pero con errores de la bandeja.
 * Nunca registra URLs (pueden llevar tokens) ni cuerpos (pueden llevar mensajes).
 */
export async function inboxFetch(url: string, init: RequestInit = {}, attempts = 3): Promise<Response> {
  let lastStatus: number | undefined;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000), cache: "no-store" });
      if (res.status !== 429 && res.status < 500) return res;
      lastStatus = res.status;
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 20_000) : 500 * 2 ** i;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, wait));
    } catch {
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw new InboxError(lastStatus === 429 ? "rate_limited" : "unavailable", lastStatus);
}

export async function inboxJson<T>(res: Response, code = "bad_response"): Promise<T> {
  const body = (await res.json().catch(() => null)) as T | null;
  if (res.status === 401) throw new InboxError("token_expired", 401);
  if (!res.ok || body === null) throw new InboxError(code, res.status);
  return body;
}
