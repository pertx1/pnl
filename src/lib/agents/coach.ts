import "server-only";
import { z } from "zod";
import { brandBlock, COMMON_RULES, type BrandContext } from "./brand";
import { runStructured } from "./client";

/**
 * Agente Coach de calentamiento: personaliza la checklist según el nicho y la ajusta si el usuario marca problemas.
 * TODAS las tareas son acciones que hace la persona a mano en la app oficial: el Coach nunca propone automatizar nada.
 * Lo que devuelve pasa además por `sanitizeWarmupTasks` antes de guardarse.
 */
export const COACH_VERSION = "coach@2026-11-20.1";

const SYSTEM = `Eres el Coach de calentamiento de Kreo: ayudas a preparar cuentas nuevas de TikTok, Instagram y YouTube de forma sana y legal.
${COMMON_RULES}
- Todas las tareas las hace la persona A MANO desde la app oficial. Nunca propongas bots, automatizaciones, herramientas de terceros que actúen en su nombre, VPN/proxies, cuentas falsas, comprar seguidores/likes/views, grupos de engagement, follow/unfollow masivo ni publicar el mismo vídeo en varias cuentas.
- Interacción genuina: ver contenido del nicho, comentarios que aporten y respuestas, siempre en números pequeños (≤ 10 al día).
- Frecuencia sana: como mucho 1 publicación al día durante el calentamiento.
- Si hay problemas (p. ej. 0 views), prioriza revisar el estado de la cuenta en la app, contenido 100 % original y mejores ganchos. No prometas que se solucionará.
- Categorías: profile (perfil), content (contenido), engage (interacción manual), safety (seguridad / normas), learn (aprender / estadísticas).
- 2–5 tareas por día. "targetCount" solo si la tarea tiene un número (si no, null).`;

const PlanSchema = z.object({
  tasks: z.array(
    z.object({
      day: z.number(),
      category: z.enum(["profile", "content", "engage", "safety", "learn"]),
      title: z.string(),
      detail: z.string(),
      targetCount: z.number().nullable(),
    }),
  ),
  tips: z.array(z.string()),
});

export async function coachPlan(
  brand: BrandContext,
  input: { platform: string; niche: string; fromDay: number; durationDays: number; issues: string[]; doneTitles: string[]; locale: string },
) {
  return runStructured({
    system: SYSTEM,
    user: `${brandBlock(brand)}
Idioma: ${input.locale === "en" ? "inglés" : "español"}
Red: ${input.platform}
Nicho: <niche>${input.niche || "no indicado"}</niche>
Duración del plan: ${input.durationDays} días. Genera tareas SOLO para los días ${input.fromDay}–${input.durationDays}.
Problemas que marca el usuario: ${input.issues.length ? input.issues.join(", ") : "ninguno"}
Tareas ya hechas: ${input.doneTitles.length ? input.doneTitles.slice(0, 40).join(" | ") : "ninguna"}`,
    schema: PlanSchema,
    maxTokens: 10000,
  });
}
