import "server-only";
import { z } from "zod";
import { brandBlock, COMMON_RULES, type BrandContext } from "@/lib/agents/brand";
import { runStructured } from "@/lib/agents/client";

/** Agente "Community manager" (versión MCP): propone un BORRADOR de respuesta. Nunca envía nada. */
export const DRAFT_REPLY_VERSION = "mcp-draft-reply@2026-11-19.1";

const SYSTEM = `Eres el community manager de Kreo. Redactas BORRADORES de respuesta a mensajes, comentarios o emails que ha recibido la marca.
${COMMON_RULES}
- No envíes nada ni digas que se ha enviado: es un borrador que una persona revisará.
- No inventes datos (precios, plazos, políticas) que no estén en el contexto; si faltan, deja un hueco entre corchetes, p. ej. [plazo de envío].
- No pidas datos sensibles (contraseñas, tarjetas, documentos de identidad).
- Respuestas breves, cordiales y con el tono de la marca.`;

const Schema = z.object({ reply: z.string(), notes: z.string() });

export async function draftReply(brand: BrandContext, input: { message: string; context?: string; tone?: string; locale: "es" | "en" }) {
  return runStructured({
    system: SYSTEM,
    user: `${brandBlock(brand)}
Idioma: ${input.locale === "en" ? "inglés" : "español"}
${input.tone ? `Tono pedido: ${input.tone}\n` : ""}${input.context ? `Contexto que da el usuario:\n<context>${input.context}</context>\n` : ""}Mensaje recibido:
<message>${input.message}</message>
Devuelve "reply" (el borrador) y "notes" (qué debe comprobar la persona antes de enviarlo, en una frase).`,
    schema: Schema,
  });
}
