/**
 * Subida directa navegador → YouTube sobre una URL de sesión reanudable abierta por el servidor.
 * El navegador NUNCA tiene el access token: solo la URL de la sesión, que sirve para subir los bytes de ESTE vídeo.
 * Protocolo (guía oficial «Resumable Uploads»): PUT por trozos múltiplos de 256 KB con `Content-Range`,
 * 308 + `Range` mientras falte, 200/201 con el recurso del vídeo al terminar, `bytes *\/size` para reanudar.
 */
import { backoffMs, classifyUploadStatus, DEFAULT_CHUNK, nextChunk, offsetFromRange, statusQueryRange } from "./youtube-upload-core";

export type DirectUploadErrorKey = "cancelled" | "expired" | "interrupted" | "rejected" | "bad_response";
export class DirectUploadError extends Error {
  constructor(
    public key: DirectUploadErrorKey,
    public status?: number,
    /** Último byte confirmado por YouTube (para reanudar). */
    public offset = 0,
  ) {
    super(key);
  }
}

type XhrResult = { status: number; range: string | null; body: string };

function xhrPut(url: string, body: Blob | null, headers: Record<string, string>, signal: AbortSignal, onProgress?: (loaded: number) => void): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DirectUploadError("cancelled"));
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    const onAbort = () => xhr.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded);
    const done = (r: XhrResult) => {
      signal.removeEventListener("abort", onAbort);
      resolve(r);
    };
    xhr.onload = () => done({ status: xhr.status, range: xhr.getResponseHeader("Range"), body: xhr.responseText });
    // Red caída o bloqueo CORS → status 0 (se trata como reintentable).
    xhr.onerror = () => done({ status: 0, range: null, body: "" });
    xhr.ontimeout = () => done({ status: 0, range: null, body: "" });
    xhr.onabort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new DirectUploadError("cancelled"));
    };
    xhr.send(body);
  });
}

function videoIdFrom(body: string): string {
  try {
    const id = (JSON.parse(body) as { id?: unknown }).id;
    if (typeof id === "string" && /^[A-Za-z0-9_-]{6,20}$/.test(id)) return id;
  } catch {
    /* cae abajo */
  }
  throw new DirectUploadError("bad_response");
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), reject(new DirectUploadError("cancelled"))), { once: true });
  });

/**
 * Sube `file` a la sesión. Con `resume` pregunta primero a YouTube cuánto tiene ya (`Content-Range: bytes *\/size`).
 * Devuelve el id del vídeo creado. Reintenta con backoff los cortes de red y 5xx (máx. 8 seguidos).
 */
export async function uploadToYouTubeSession(opts: {
  sessionUrl: string;
  file: Blob;
  resume?: boolean;
  chunkSize?: number;
  signal: AbortSignal;
  onProgress: (sentBytes: number) => void;
}): Promise<string> {
  const { sessionUrl, file, signal } = opts;
  const size = file.size;
  let offset = 0;
  let failures = 0;
  let stalls = 0;

  async function queryOffset(): Promise<number | string> {
    const r = await xhrPut(sessionUrl, null, { "Content-Range": statusQueryRange(size) }, signal);
    const step = classifyUploadStatus(r.status);
    if (step === "done") return videoIdFrom(r.body);
    if (step === "incomplete") return offsetFromRange(r.range);
    if (step === "expired") throw new DirectUploadError("expired", r.status, offset);
    if (step === "fatal") throw new DirectUploadError("rejected", r.status, offset);
    throw new DirectUploadError("interrupted", r.status, offset);
  }

  if (opts.resume) {
    const q = await queryOffset();
    if (typeof q === "string") return q;
    offset = q;
  }

  while (true) {
    opts.onProgress(offset);
    const c = nextChunk(offset, size, opts.chunkSize ?? DEFAULT_CHUNK);
    const r = await xhrPut(sessionUrl, file.slice(c.start, c.end + 1), { "Content-Range": c.contentRange }, signal, (loaded) =>
      opts.onProgress(offset + loaded),
    );
    const step = classifyUploadStatus(r.status);
    if (step === "done") {
      opts.onProgress(size);
      return videoIdFrom(r.body);
    }
    if (step === "incomplete") {
      failures = 0;
      const next = offsetFromRange(r.range);
      // Sin avance (p. ej. cabecera Range no legible): tras 3 intentos se para en vez de reenviar en bucle.
      stalls = next <= offset ? stalls + 1 : 0;
      if (stalls >= 3) throw new DirectUploadError("interrupted", r.status, offset);
      offset = next;
      continue;
    }
    if (step === "expired") throw new DirectUploadError("expired", r.status, offset);
    if (step === "fatal") throw new DirectUploadError("rejected", r.status, offset);
    // Reintentable: esperar, preguntar el offset real y seguir desde ahí.
    if (++failures > 8) throw new DirectUploadError("interrupted", r.status, offset);
    await sleep(backoffMs(failures - 1), signal);
    try {
      const q = await queryOffset();
      if (typeof q === "string") return q;
      offset = q;
    } catch (e) {
      if (e instanceof DirectUploadError && e.key === "interrupted") continue; // sigue sin red: siguiente intento
      throw e;
    }
  }
}
