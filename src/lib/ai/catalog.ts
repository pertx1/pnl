/**
 * Catálogo de modelos permitidos. SOLO modelos con licencia de uso comercial (sección 0.2 del brief).
 * El coste en créditos es PROVISIONAL (se fijará con los precios) y se muestra SIEMPRE antes de generar.
 * Antes de añadir un modelo: verificar su licencia y las condiciones del proveedor (ver docs/compliance.md).
 */
export type ImageAspect = "square" | "portrait" | "landscape" | "story";

export type ImageModel = {
  id: string;
  provider: "fal";
  endpoint: string;
  label: string;
  credits: number;
  license: { name: string; commercialUse: true; url: string; notes: string };
};

export const IMAGE_MODELS: ImageModel[] = [
  {
    id: "flux-schnell",
    provider: "fal",
    endpoint: "fal-ai/flux/schnell",
    label: "FLUX.1 [schnell]",
    credits: 2,
    license: {
      name: "Apache 2.0",
      commercialUse: true,
      url: "https://huggingface.co/black-forest-labs/FLUX.1-schnell",
      notes: "Uso comercial permitido. Eres responsable de no generar contenido que vulnere derechos de terceros (marcas, personas reales).",
    },
  },
];

export const ASPECTS: Record<ImageAspect, string> = {
  square: "square_hd",
  portrait: "portrait_4_3",
  landscape: "landscape_16_9",
  story: "portrait_16_9",
};

export function getImageModel(id: string) {
  return IMAGE_MODELS.find((m) => m.id === id) ?? null;
}
