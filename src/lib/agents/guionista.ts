import "server-only";
import { z } from "zod";
import { brandBlock, COMMON_RULES, type BrandContext } from "./brand";
import { runStructured } from "./client";

/** Agente Guionista: hooks, guiones y captions con el tono de la marca. */
export const GUIONISTA_VERSION = "guionista@2026-11-19.1";

const SYSTEM = `Eres el Guionista de Kreo: redactas captions, hooks y guiones para redes sociales con el tono exacto de la marca.
${COMMON_RULES}
- Adapta el texto a cada red: TikTok e Instagram (máx. 2.200 caracteres, gancho en la primera línea, 3-5 hashtags relevantes), YouTube (descripción clara).
- Nada de clickbait engañoso.`;

const CaptionsSchema = z.object({
  options: z.array(z.object({ caption: z.string(), hook: z.string() })).min(1).max(3),
});

export async function suggestCaptions(brand: BrandContext, input: { brief: string; platform: string; locale: string }) {
  return runStructured({
    system: SYSTEM,
    user: `${brandBlock(brand)}
Idioma: ${input.locale === "en" ? "inglés" : "español"}
Red: ${input.platform}
Tema / borrador del usuario:
<brief>${input.brief}</brief>
Propón 3 captions distintos (cada uno con su hook de primera línea).`,
    schema: CaptionsSchema,
  });
}

const VariationsSchema = z.object({ variations: z.array(z.object({ accountKey: z.string(), caption: z.string() })) });

/** Variaciones del mismo mensaje para varias cuentas (evita subir contenido idéntico: anti-baneo). */
export async function captionVariations(brand: BrandContext, input: { caption: string; accounts: { key: string; platform: string }[]; locale: string }) {
  return runStructured({
    system: SYSTEM,
    user: `${brandBlock(brand)}
Idioma: ${input.locale === "en" ? "inglés" : "español"}
Texto base:
<caption>${input.caption}</caption>
Reescribe el texto para cada cuenta de forma que el mensaje sea el mismo pero el texto NO sea idéntico (cambia el hook, el orden, la llamada a la acción y los hashtags), adaptado a su red.
Cuentas: ${input.accounts.map((a) => `${a.key} (${a.platform})`).join(", ")}
Devuelve una variación por cuenta usando exactamente su accountKey.`,
    schema: VariationsSchema,
  });
}
