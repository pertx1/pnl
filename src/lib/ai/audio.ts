/**
 * Catálogo de audio (ElevenLabs, API oficial). Verificado el 2026-11-19 en la documentación oficial:
 *  - Texto a voz: POST /v1/text-to-speech/{voice_id} · https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 *  - Música:      POST /v1/music                     · https://elevenlabs.io/docs/api-reference/music/compose
 *  - Precios API: https://elevenlabs.io/pricing/api (v2 Multilingual 0,08 $/1K caracteres; Flash 0,04 $/1K; música 0,15 $/min)
 *
 * Créditos: 1 crédito ≈ 0,01 $ de coste del proveedor, redondeando hacia arriba (mínimo 1). Se muestra SIEMPRE antes.
 */
export type VoiceModel = {
  id: string;
  label: string;
  tagline: { es: string; en: string };
  usdPer1kChars: number;
  maxChars: number;
};

export const VOICE_MODELS: VoiceModel[] = [
  {
    id: "eleven_multilingual_v2",
    label: "Multilingual v2",
    tagline: { es: "La voz más natural y expresiva. 29 idiomas.", en: "Most natural, expressive voice. 29 languages." },
    usdPer1kChars: 0.08,
    maxChars: 4000,
  },
  {
    id: "eleven_flash_v2_5",
    label: "Flash v2.5",
    tagline: { es: "Rápida y a mitad de precio. Ideal para borradores.", en: "Fast and half the price. Great for drafts." },
    usdPer1kChars: 0.04,
    maxChars: 4000,
  },
];

export const MUSIC_MODEL = { id: "music_v2_5", label: "Eleven Music v2.5", usdPerMinute: 0.15 };
export const MUSIC_DURATIONS = [15, 30, 60, 90, 120] as const;

export function getVoiceModel(id: string) {
  return VOICE_MODELS.find((m) => m.id === id) ?? null;
}

/** Créditos de una locución (por caracteres). */
export function voiceCredits(model: VoiceModel, chars: number) {
  return Math.max(1, Math.ceil(model.usdPer1kChars * (Math.max(0, chars) / 1000) * 100));
}

/** Créditos de una pista de música (por duración). */
export function musicCredits(seconds: number) {
  return Math.max(1, Math.ceil(MUSIC_MODEL.usdPerMinute * (Math.max(0, seconds) / 60) * 100));
}

/** Condiciones de uso que se guardan con cada generación y se muestran antes de generar. */
export const AUDIO_LICENSE = {
  name: "ElevenLabs · Terms of Service + Eleven Music terms",
  url: "https://elevenlabs.io/terms-of-use",
  musicUrl: "https://elevenlabs.io/eleven-music-model-specific-terms",
  notes:
    "Uso comercial permitido con el plan de pago de Kreo en ElevenLabs. Música: uso online/offline comercial salvo cine, TV, radio y videojuegos de estudio (requieren Enterprise). Solo voces de la biblioteca por defecto: no imites a personas reales.",
};
