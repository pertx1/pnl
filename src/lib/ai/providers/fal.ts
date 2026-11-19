import "server-only";

/** Proveedor fal.ai (API oficial). Clave: FAL_KEY. No enviamos datos personales: solo el prompt. */
export function isFalConfigured() {
  return Boolean(process.env.FAL_KEY);
}

export type FalImage = { url: string; width?: number; height?: number; content_type?: string };

export async function falGenerateImage(endpoint: string, input: Record<string, unknown>): Promise<{ images: FalImage[]; requestId?: string }> {
  const res = await fetch(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`fal_${res.status}`);
  const json = (await res.json()) as { images?: FalImage[]; request_id?: string };
  if (!json.images?.length) throw new Error("fal_empty");
  return { images: json.images, requestId: json.request_id };
}
