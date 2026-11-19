import "server-only";

/**
 * fetch para APIs públicas de investigación (YouTube Data API, Graph API, Ad Library, oEmbed).
 * Igual que `platformFetch`: timeout 15 s, máx. 3 intentos, backoff exponencial SOLO para 429/5xx/red, respeta Retry-After.
 * Los errores nunca incluyen la URL (lleva claves/tokens) ni datos personales: solo un código.
 */
export class ResearchError extends Error {
  constructor(
    public source: string,
    public code: string,
    public status?: number,
  ) {
    super(`${source}:${code}`);
  }
}

export async function researchFetch(source: string, url: string, init: RequestInit = {}, attempts = 3): Promise<Response> {
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
  throw new ResearchError(source, lastStatus === 429 ? "rate_limited" : "unavailable", lastStatus);
}

export async function researchJson<T>(source: string, url: string, init?: RequestInit, code = "bad_response"): Promise<T> {
  const res = await researchFetch(source, url, init);
  const body = (await res.json().catch(() => null)) as (T & { error?: { code?: number; error_subcode?: number; message?: string } }) | null;
  if (!res.ok || body === null) {
    // Meta: code 4/17/32/613 = límite de peticiones; 190 = token no válido; 10/200 = permisos.
    const metaCode = body?.error?.code;
    if (metaCode && [4, 17, 32, 613].includes(metaCode)) throw new ResearchError(source, "rate_limited", res.status);
    if (metaCode === 190) throw new ResearchError(source, "token_invalid", res.status);
    if (metaCode === 10 || metaCode === 200) throw new ResearchError(source, "permission_denied", res.status);
    if (res.status === 403) throw new ResearchError(source, "quota_or_forbidden", res.status);
    if (res.status === 404) throw new ResearchError(source, "not_found", res.status);
    throw new ResearchError(source, code, res.status);
  }
  return body;
}

/** Código de error seguro para guardar/mostrar (nunca el mensaje original de la API). */
export function errorCode(e: unknown): string {
  if (e instanceof ResearchError) return e.code;
  return "unavailable";
}
