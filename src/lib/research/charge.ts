import "server-only";
import { AgentRefusalError, isAgentsConfigured } from "@/lib/agents";
import { getBrandContext } from "@/lib/ai/brand-context";
import type { BrandContext } from "@/lib/agents/brand";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AiResult<T> = { ok: true; data: T; generationId: string } | { ok?: false; error: string };

/**
 * Patrón withCharge (ver posts/ai-actions.ts): cobra los créditos y registra la generación de forma atómica con
 * `start_ai_generation` (exige rol editor), ejecuta el agente y, si falla, devuelve los créditos con `grant_credits`.
 */
export async function withCharge<T>(opts: { projectId: string; agent: string; prompt: string; credits: number; idempotencyKey?: string }, run: () => Promise<T>): Promise<AiResult<T>> {
  if (!isAgentsConfigured()) return { error: "not_configured" };
  const supabase = await createClient();
  const { data: genId, error } = await supabase.rpc("start_ai_generation", {
    p_project_id: opts.projectId,
    p_kind: "text",
    p_provider: "anthropic",
    p_model: "claude-opus-5-5",
    p_prompt: opts.prompt.slice(0, 4000),
    p_params: { agent: opts.agent },
    p_credits: opts.credits,
    p_license: { name: "Anthropic Commercial Terms", commercialUse: true },
    p_idempotency_key: opts.idempotencyKey ?? crypto.randomUUID(),
  });
  if (error || !genId) return { error: error?.message.includes("insufficient_credits") ? "insufficient_credits" : "forbidden" };
  const admin = createAdminClient();
  try {
    const data = await run();
    await admin?.from("ai_generations").update({ status: "succeeded", completed_at: new Date().toISOString() }).eq("id", genId);
    return { ok: true, data, generationId: genId };
  } catch (e) {
    const code = e instanceof AgentRefusalError ? "refusal" : "provider_error";
    console.error("[research] fallo del agente", opts.agent, code);
    if (admin) {
      const { data: gen } = await admin.from("ai_generations").select("workspace_id").eq("id", genId).single();
      await admin.from("ai_generations").update({ status: "refunded", error_code: code, completed_at: new Date().toISOString() }).eq("id", genId);
      if (gen)
        await admin.rpc("grant_credits", {
          p_workspace_id: gen.workspace_id,
          p_amount: opts.credits,
          p_reason: "refund_ai_failure",
          p_idempotency_key: `refund:${genId}`,
          p_ref_type: "ai_generation",
          p_ref_id: genId,
        });
    }
    return { error: code };
  }
}

/** Contexto de marca del proyecto (brand kit) para los agentes. */
export async function brandFor(projectId: string): Promise<BrandContext | null> {
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
  if (!project) return null;
  const ctx = await getBrandContext(projectId);
  return { projectName: project.name, ...ctx };
}
