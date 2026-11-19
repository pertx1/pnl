import "server-only";
import { z } from "zod";
import { brandBlock, COMMON_RULES, type BrandContext } from "./brand";
import { runStructured } from "./client";

/**
 * Agente Planificador: escribe el texto de cada borrador que el planificador (lógica pura, src/lib/strategy/planner.ts)
 * ya ha repartido respetando los límites diarios. Solo redacta: no decide fechas ni cuentas y nada se aprueba solo.
 */
export const PLANIFICADOR_VERSION = "planificador@2026-11-20.1";

const SYSTEM = `Eres el Planificador de Kreo: redactas borradores de publicaciones para el calendario a partir de un pilar de contenido y una idea.
${COMMON_RULES}
- Cada borrador es un punto de partida que la persona editará: gancho en la primera línea, desarrollo breve y una llamada a la acción.
- TikTok e Instagram: máx. 2.200 caracteres y 3–5 hashtags relevantes. YouTube: descripción clara.
- MUY IMPORTANTE (anti-baneo): ningún texto puede ser idéntico a otro, sobre todo entre cuentas distintas. Cambia el gancho, el orden, la CTA y los hashtags.`;

const DraftsSchema = z.object({ drafts: z.array(z.object({ key: z.string(), title: z.string(), caption: z.string() })) });

export async function writeDrafts(
  brand: BrandContext,
  input: { slots: { key: string; platform: string; account: string; pillar: string; idea: string; day: string }[]; locale: string },
) {
  return runStructured({
    system: SYSTEM,
    user: `${brandBlock(brand)}
Idioma: ${input.locale === "en" ? "inglés" : "español"}
Borradores a redactar (devuelve uno por "key", exactamente con la misma key):
${input.slots.map((s) => `- key=${s.key} · red=${s.platform} · cuenta=${s.account} · día=${s.day} · pilar=${s.pillar} · idea=${s.idea}`).join("\n")}`,
    schema: DraftsSchema,
    maxTokens: 16000,
  });
}
