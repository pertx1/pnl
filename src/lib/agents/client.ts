import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/**
 * Cliente de Claude para los agentes de Kreo (texto). Modelo: Claude Opus 5.5.
 * - Salidas estructuradas (Zod) → JSON validado.
 * - Respaldo automático ante rechazos (server-side fallbacks, "default").
 * - Solo se envía el contexto de marca y la petición: nunca emails, tokens ni datos de terceros innecesarios.
 * - Los agentes PROPONEN: nada de lo que devuelven se publica ni se envía sin aprobación humana.
 */
export const AGENT_MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
export function isAgentsConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

export class AgentRefusalError extends Error {}

export async function runStructured<S extends z.ZodType>(opts: {
  system: string;
  user: string;
  schema: S;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const response = await getClient().beta.messages.parse({
    model: AGENT_MODEL,
    max_tokens: opts.maxTokens ?? 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    output_config: { effort: opts.effort ?? "low", format: betaZodOutputFormat(opts.schema) },
  });
  if (response.stop_reason === "refusal") throw new AgentRefusalError(response.stop_details?.category ?? "refusal");
  if (!response.parsed_output) throw new Error("agent_parse_failed");
  return response.parsed_output as z.infer<S>;
}
