import "server-only";
import { z } from "zod";
import { brandBlock, COMMON_RULES, type BrandContext } from "./brand";
import { runStructured } from "./client";

/** Agente Estratega: estrategia de marketing (pilares, público, frecuencia, objetivos/KPIs) + roadmap con hitos y tareas. */
export const ESTRATEGA_VERSION = "estratega@2026-11-20.1";

const SYSTEM = `Eres el Estratega de Kreo: diseñas estrategias de contenido orgánico para creadores, dropshippers, marcas y agencias.
${COMMON_RULES}
- La estrategia debe ser realista para una persona o un equipo pequeño: frecuencias sanas (TikTok 3–7/semana, Instagram 3–5/semana, YouTube 1–3/semana).
- Nada de tácticas que rompan las normas de las plataformas: ni comprar seguidores, ni grupos de engagement, ni follow/unfollow, ni publicar el mismo vídeo en varias cuentas.
- Los objetivos deben tener un KPI medible con las estadísticas nativas de la red y una meta prudente. Si no hay datos, propón metas de proceso (constancia, nº de piezas) y deja las de crecimiento como "a definir".
- Los pilares suman 100 en "share". Entre 3 y 5 pilares, con 2–4 ideas de ejemplo concretas cada uno.
- Roadmap de 90 días: 3–5 hitos con "dayOffset" (días desde hoy) y 2–5 tareas por hito. Cada tarea de contenido indica la red ("platform") y un brief breve para el guion.`;

export const StrategyOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  audience: z.string(),
  pillars: z.array(z.object({ name: z.string(), description: z.string(), examples: z.array(z.string()), share: z.number() })),
  frequency: z.array(z.object({ platform: z.enum(["tiktok", "instagram", "youtube"]), postsPerWeek: z.number(), hour: z.number() })),
  objectives: z.array(z.object({ objective: z.string(), kpi: z.string(), target: z.string(), dayOffset: z.number() })),
  milestones: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      dayOffset: z.number(),
      tasks: z.array(z.object({ title: z.string(), brief: z.string(), platform: z.enum(["tiktok", "instagram", "youtube", "none"]), dayOffset: z.number() })),
    }),
  ),
});
export type StrategyOutput = z.infer<typeof StrategyOutputSchema>;

export async function generateStrategy(
  brand: BrandContext,
  input: { goal: string; notes: string; platforms: string[]; accountLabel: string | null; metrics: string; locale: string },
) {
  return runStructured({
    system: SYSTEM,
    user: `${brandBlock(brand)}
Idioma de la respuesta: ${input.locale === "en" ? "inglés" : "español"}
Ámbito: ${input.accountLabel ? `solo la cuenta ${input.accountLabel}` : "todo el proyecto"}
Redes: ${input.platforms.join(", ") || "tiktok, instagram"}
Objetivo principal: ${input.goal}
<notes>${input.notes}</notes>
<metrics>${input.metrics || "Sin métricas todavía (cuenta nueva o sin conectar)."}</metrics>
Diseña la estrategia y el roadmap de 90 días. Usa solo las redes indicadas en "frequency" y en las tareas.`,
    schema: StrategyOutputSchema,
    effort: "medium",
    maxTokens: 12000,
  });
}
