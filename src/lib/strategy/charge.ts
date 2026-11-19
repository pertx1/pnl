import "server-only";
import { AGENT_MODEL, AgentRefusalError, isAgentsConfigured } from "@/lib/agents/client";
import { getBrandContext } from "@/lib/ai/brand-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AiResult<T> = { ok: true; data: T; generationId: string } | { ok?: false; error: string };

/**
 * Cobra los créditos y registra la generación de forma atómica (`start_ai_generation`, exige editor),
 * ejecuta el agente y, si falla, devuelve los créditos (`grant_credits` con clave `refund:<id>`).
 * Mismo patrón que `posts/ai-actions.ts` → withCharge, con coste variable.
 */
export async function withCharge<T>(opts: {
  projectId: string;
  agent: string;
  promptVersion: string;
  prompt: string;
  credits: number;
  idempotencyKey: string;
  run: () => Promise<T>;
}): Promise<AiResult<T>> {
  if (!isAgentsConfigured()) return { error: "not_configured" };
  const supabase = await createClient();
  const { data: genId, error } = await supabase.rpc("start_ai_generation", {
    p_project_id: opts.projectId,
    p_kind: "text",
    p_provider: "anthropic",
    p_model: AGENT_MODEL,
    p_prompt: opts.prompt.slice(0, 4000),
    p_params: { agent: opts.agent, prompt_version: opts.promptVersion },
    p_credits: opts.credits,
    p_license: { name: "Anthropic Commercial Terms", commercialUse: true },
    p_idempotency_key: opts.idempotencyKey,
  });
  if (error || !genId) return { error: error?.message.includes("insufficient_credits") ? "insufficient_credits" : "forbidden" };
  const admin = createAdminClient();
  try {
    const data = await opts.run();
    await admin?.from("ai_generations").update({ status: "succeeded", completed_at: new Date().toISOString() }).eq("id", genId);
    return { ok: true, data, generationId: genId };
  } catch (e) {
    if (admin) {
      const { data: gen } = await admin.from("ai_generations").select("workspace_id").eq("id", genId).single();
      await admin.from("ai_generations").update({ status: "refunded", error_code: e instanceof AgentRefusalError ? "refusal" : "provider_error" }).eq("id", genId);
      if (gen) await admin.rpc("grant_credits", { p_workspace_id: gen.workspace_id, p_amount: opts.credits, p_reason: "refund_ai_failure", p_idempotency_key: `refund:${genId}` });
    }
    return { error: e instanceof AgentRefusalError ? "refusal" : "provider_error" };
  }
}

/** Contexto de marca del proyecto (brand kit). null si el usuario no tiene acceso (RLS). */
export async function brandFor(projectId: string) {
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
  if (!project) return null;
  const ctx = await getBrandContext(projectId);
  return { projectName: project.name, ...ctx };
}
