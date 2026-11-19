import "server-only";

/**
 * Proveedor ElevenLabs (API oficial). Clave: ELEVENLABS_API_KEY (solo servidor).
 * Al proveedor solo va el texto a locutar o la descripción de la música: nada de datos personales.
 * Solo ofrecemos voces de la biblioteca por defecto (`voice_type=default`): nada de clonar voces de terceros.
 */
export function isElevenLabsConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

const BASE = () => (process.env.ELEVENLABS_BASE_URL ?? "https://api.elevenlabs.io").replace(/\/$/, "");
const headers = () => ({ "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "", "Content-Type": "application/json" });

export type Voice = { id: string; name: string; description: string | null; previewUrl: string | null; labels: Record<string, string> };

/** Voces por defecto de ElevenLabs (cacheadas 1 h). Si falla, lista vacía (la UI lo indica). */
export async function listVoices(): Promise<Voice[]> {
  if (!isElevenLabsConfigured()) return [];
  try {
    const res = await fetch(`${BASE()}/v2/voices?voice_type=default&page_size=100&include_total_count=false`, {
      headers: headers(),
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      voices?: { voice_id: string; name?: string; description?: string | null; preview_url?: string | null; labels?: Record<string, string> }[];
    };
    return (json.voices ?? []).map((v) => ({
      id: v.voice_id,
      name: v.name ?? v.voice_id,
      description: v.description ?? null,
      previewUrl: v.preview_url ?? null,
      labels: v.labels ?? {},
    }));
  } catch {
    return [];
  }
}

async function audioOrThrow(res: Response) {
  if (!res.ok) throw new Error(`elevenlabs_${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength < 100) throw new Error("elevenlabs_empty");
  if (buf.byteLength > 50 * 1024 * 1024) throw new Error("elevenlabs_too_big");
  return buf;
}

/** Texto a voz → MP3 (44,1 kHz, 128 kbps). */
export async function textToSpeech(opts: { voiceId: string; text: string; modelId: string }) {
  if (!/^[A-Za-z0-9]{8,40}$/.test(opts.voiceId)) throw new Error("elevenlabs_bad_voice");
  const res = await fetch(`${BASE()}/v1/text-to-speech/${opts.voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text: opts.text, model_id: opts.modelId }),
    signal: AbortSignal.timeout(120_000),
  });
  return audioOrThrow(res);
}

/** Música a partir de una descripción → MP3. Firmado con C2PA (marca de contenido sintético, AI Act art. 50). */
export async function composeMusic(opts: { prompt: string; seconds: number; instrumental: boolean; modelId: string }) {
  const res = await fetch(`${BASE()}/v1/music?output_format=mp3_44100_128`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      prompt: opts.prompt,
      music_length_ms: Math.round(opts.seconds * 1000),
      model_id: opts.modelId,
      force_instrumental: opts.instrumental,
      sign_with_c2pa: true,
    }),
    signal: AbortSignal.timeout(280_000),
  });
  return audioOrThrow(res);
}
