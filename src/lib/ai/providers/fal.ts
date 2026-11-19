import "server-only";

/**
 * Proveedor fal.ai (API oficial). Clave: FAL_KEY (solo servidor).
 * Solo enviamos el prompt y, si hace falta, una URL firmada de 1 h a la imagen de partida: nada de datos personales.
 * - Imagen: llamada directa (https://fal.run), responde en segundos.
 * - Vídeo: cola (https://queue.fal.run) → se consulta el estado hasta que termina.
 */
export function isFalConfigured() {
  return Boolean(process.env.FAL_KEY);
}

const headers = () => ({ Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" });

export type FalFile = { url: string; width?: number; height?: number; content_type?: string; file_size?: number };

export async function falRun(endpoint: string, input: Record<string, unknown>) {
  const res = await fetch(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`fal_${res.status}`);
  return (await res.json()) as { images?: FalFile[]; video?: FalFile; request_id?: string };
}

export type QueueTicket = { requestId: string; statusUrl: string; responseUrl: string };

export async function falSubmit(endpoint: string, input: Record<string, unknown>): Promise<QueueTicket> {
  const res = await fetch(`https://queue.fal.run/${endpoint}`, { method: "POST", headers: headers(), body: JSON.stringify(input), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`fal_${res.status}`);
  const j = (await res.json()) as { request_id: string; status_url: string; response_url: string };
  return { requestId: j.request_id, statusUrl: j.status_url, responseUrl: j.response_url };
}

/** Solo aceptamos URLs de la cola de fal.ai (evita que un dato manipulado nos haga llamar a otro host con la clave). */
function assertFalQueueUrl(url: string) {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.hostname !== "queue.fal.run") throw new Error("fal_bad_url");
}

export async function falStatus(statusUrl: string): Promise<"IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "ERROR"> {
  assertFalQueueUrl(statusUrl);
  const res = await fetch(statusUrl, { headers: headers(), signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) return "ERROR";
  const j = (await res.json()) as { status?: string };
  return (j.status as "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED") ?? "ERROR";
}

export async function falResult(responseUrl: string) {
  assertFalQueueUrl(responseUrl);
  const res = await fetch(responseUrl, { headers: headers(), signal: AbortSignal.timeout(30_000), cache: "no-store" });
  if (!res.ok) throw new Error(`fal_${res.status}`);
  return (await res.json()) as { images?: FalFile[]; video?: FalFile };
}

/** Descarga un archivo generado (solo desde CDNs de fal) con límite de tamaño. */
export async function downloadFalFile(url: string, maxBytes = 50 * 1024 * 1024) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !(u.hostname === "fal.media" || u.hostname.endsWith(".fal.media") || u.hostname.endsWith(".fal.ai") || u.hostname.endsWith(".fal.run"))) {
    throw new Error("fal_bad_file_url");
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`fal_file_${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new Error("fal_file_too_big");
  return { bytes: buf, contentType: res.headers.get("content-type") ?? "" };
}
