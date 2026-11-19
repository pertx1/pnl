/**
 * Catálogo de modelos de IA (fal.ai). SOLO modelos con la etiqueta "Commercial use" en su ficha de fal.ai
 * (verificado el 2026-11-19). Precios de fal.ai a esa fecha; revisar periódicamente: https://fal.ai/pricing
 *
 * Créditos: 1 crédito ≈ 0,01 $ de coste del proveedor, redondeando hacia arriba (provisional, sin margen).
 * El coste se muestra SIEMPRE antes de generar.
 */
export type Aspect = "1:1" | "9:16" | "16:9" | "4:5";
export type ModelKind = "image" | "video";

export type AiModel = {
  id: string;
  kind: ModelKind;
  endpoint: string;
  label: string;
  /** Descripción corta para elegir: calidad / velocidad / precio. */
  tagline: { es: string; en: string };
  tier: "budget" | "balanced" | "premium";
  /** Coste del proveedor en USD por imagen o por segundo de vídeo. */
  usdPerUnit: number;
  /** Duraciones permitidas (vídeo). */
  durations?: number[];
  /** Requiere una imagen de partida (imagen → vídeo). */
  needsImage?: boolean;
  modelPage: string;
  /** Construye el cuerpo de la petición a fal.ai. */
  buildInput: (o: { prompt: string; aspect: Aspect; duration?: number; imageUrl?: string }) => Record<string, unknown>;
};

const IMAGE_SIZE: Record<Aspect, string> = { "1:1": "square_hd", "9:16": "portrait_16_9", "16:9": "landscape_16_9", "4:5": "portrait_4_3" };
const MINIMAX_ASPECT: Record<Aspect, string> = { "1:1": "1:1", "9:16": "9:16", "16:9": "16:9", "4:5": "3:4" };
const PIXVERSE_ASPECT: Record<Aspect, string> = { "1:1": "1:1", "9:16": "9:16", "16:9": "16:9", "4:5": "3:4" };

export const MODELS: AiModel[] = [
  // ------------------------------------------------------------------ IMAGEN
  {
    id: "flux-2-flash",
    kind: "image",
    endpoint: "fal-ai/flux-2/flash",
    label: "FLUX 2 Flash",
    tagline: { es: "Muy rápido y el más barato. Ideal para probar ideas.", en: "Very fast and cheapest. Great for trying ideas." },
    tier: "budget",
    usdPerUnit: 0.005,
    modelPage: "https://fal.ai/models/fal-ai/flux-2/flash",
    buildInput: ({ prompt, aspect }) => ({ prompt, image_size: IMAGE_SIZE[aspect], num_images: 1, output_format: "jpeg", enable_safety_checker: true }),
  },
  {
    id: "seedream-4-5",
    kind: "image",
    endpoint: "fal-ai/bytedance/seedream/v4.5/text-to-image",
    label: "Seedream 4.5",
    tagline: { es: "Fotos realistas de producto y lifestyle en alta resolución.", en: "Realistic product and lifestyle photos in high resolution." },
    tier: "balanced",
    usdPerUnit: 0.04,
    modelPage: "https://fal.ai/models/fal-ai/bytedance/seedream/v4.5/text-to-image",
    buildInput: ({ prompt, aspect }) => ({ prompt, image_size: aspect === "1:1" ? "square_hd" : IMAGE_SIZE[aspect], num_images: 1, enable_safety_checker: true }),
  },
  {
    id: "nano-banana",
    kind: "image",
    endpoint: "fal-ai/nano-banana",
    label: "Nano Banana",
    tagline: { es: "Sigue muy bien las instrucciones y escribe texto legible.", en: "Follows instructions closely and renders readable text." },
    tier: "balanced",
    usdPerUnit: 0.0398,
    modelPage: "https://fal.ai/models/fal-ai/nano-banana",
    buildInput: ({ prompt, aspect }) => ({ prompt, aspect_ratio: aspect, num_images: 1, output_format: "jpeg" }),
  },
  // ------------------------------------------------------------------ VÍDEO
  {
    id: "pixverse-v6",
    kind: "video",
    endpoint: "fal-ai/pixverse/v6/text-to-video",
    label: "PixVerse V6",
    tagline: { es: "Vídeo a partir de texto, el más barato. Bueno para borradores.", en: "Text to video, cheapest. Good for drafts." },
    tier: "budget",
    usdPerUnit: 0.005,
    durations: [5, 8],
    modelPage: "https://fal.ai/models/fal-ai/pixverse/v6/text-to-video",
    buildInput: ({ prompt, aspect, duration }) => ({ prompt, aspect_ratio: PIXVERSE_ASPECT[aspect], resolution: "720p", duration: duration ?? 5, enable_safety_checker: true }),
  },
  {
    id: "minimax-h3-turbo",
    kind: "video",
    endpoint: "minimax/h3-max-turbo/text-to-video",
    label: "MiniMax H3 Max Turbo",
    tagline: { es: "Vídeo a partir de texto con buen movimiento y precio ajustado.", en: "Text to video with good motion at a fair price." },
    tier: "balanced",
    usdPerUnit: 0.025,
    durations: [5, 10],
    modelPage: "https://fal.ai/models/minimax/h3-max-turbo/text-to-video",
    buildInput: ({ prompt, aspect, duration }) => ({
      prompt,
      duration: duration ?? 5,
      resolution: "768P",
      aspect_ratio: MINIMAX_ASPECT[aspect],
      prompt_expansion_mode: "balanced",
      enable_safety_checker: true,
    }),
  },
  {
    id: "kling-2-5-turbo",
    kind: "video",
    endpoint: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
    label: "Kling 2.5 Turbo Pro",
    tagline: { es: "Anima una imagen de tu biblioteca con calidad alta (ideal para producto).", en: "Animates an image from your library in high quality (great for products)." },
    tier: "premium",
    usdPerUnit: 0.07,
    durations: [5, 10],
    needsImage: true,
    modelPage: "https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
    buildInput: ({ prompt, duration, imageUrl }) => ({ prompt, image_url: imageUrl, duration: String(duration ?? 5), enable_safety_checker: true }),
  },
];

export function getModel(id: string) {
  return MODELS.find((m) => m.id === id) ?? null;
}

/** Créditos de una generación (1 crédito ≈ 0,01 $; mínimo 1). */
export function creditsFor(model: AiModel, duration?: number) {
  const units = model.kind === "video" ? (duration ?? model.durations?.[0] ?? 5) : 1;
  return Math.max(1, Math.ceil(model.usdPerUnit * units * 100));
}

export const LICENSE_NOTE = {
  name: "fal.ai · Commercial use",
  url: "https://fal.ai/legal/terms-of-service",
  notes: "Modelo marcado para uso comercial en fal.ai. Eres responsable de no generar contenido que vulnere derechos de terceros (marcas, personas reales).",
};
