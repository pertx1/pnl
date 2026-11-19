"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";
import { AgentRefusalError, captionVariations, isAgentsConfigured, suggestCaptions } from "@/lib/agents";
import { getBrandContext } from "@/lib/ai/brand-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const TEXT_AI_CREDITS = 1;

type AiResult<T> = { ok: true; data: T } | { ok?: false; error: string };

/** Cobra el crédito y registra la generación (atómico), ejecuta el agente y devuelve créditos si falla. */
async function withCharge<T>(projectId: string, kind: string, prompt: string, run: () => Promise<T>): Promise<AiResult<T>> {
  if (!isAgentsConfigured()) return { error: "not_configured" };
  const supabase = await createClient();
  const { data: genId, error } = await supabase.rpc("start_ai_generation", {
    p_project_id: projectId,
    p_kind: "text",
    p_provider: "anthropic",
    p_model: "claude-opus-5-5",
    p_prompt: prompt.slice(0, 4000),
    p_params: { agent: kind },
    p_credits: TEXT_AI_CREDITS,
    p_license: { name: "Anthropic Commercial Terms", commercialUse: true },
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) return { error: error.message.includes("insufficient_credits") ? "insufficient_credits" : "forbidden" };
  const admin = createAdminClient();
  try {
    const data = await run();
    await admin?.from("ai_generations").update({ status: "succeeded", completed_at: new Date().toISOString() }).eq("id", genId);
    return { ok: true, data };
  } catch (e) {
    if (admin) {
      const { data: gen } = await admin.from("ai_generations").select("workspace_id").eq("id", genId).single();
      await admin.from("ai_generations").update({ status: "refunded", error_code: e instanceof AgentRefusalError ? "refusal" : "provider_error" }).eq("id", genId);
      if (gen) await admin.rpc("grant_credits", { p_workspace_id: gen.workspace_id, p_amount: TEXT_AI_CREDITS, p_reason: "refund_ai_failure", p_idempotency_key: `refund:${genId}` });
    }
    return { error: e instanceof AgentRefusalError ? "refusal" : "provider_error" };
  }
}

async function brandFor(projectId: string) {
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
  if (!project) return null;
  const ctx = await getBrandContext(projectId);
  return { projectName: project.name, ...ctx };
}

export async function aiSuggestCaptions(projectId: string, brief: string, platform: string) {
  const parsed = z.object({ p: z.uuid(), b: z.string().trim().min(3).max(2000), pl: z.string().max(20) }).safeParse({ p: projectId, b: brief, pl: platform });
  if (!parsed.success) return { error: "invalid_input" } as AiResult<never>;
  const brand = await brandFor(projectId);
  if (!brand) return { error: "not_found" } as AiResult<never>;
  const locale = await getLocale();
  return withCharge(projectId, "guionista.captions", brief, async () => (await suggestCaptions(brand, { brief, platform, locale })).options);
}

export async function aiCaptionVariations(projectId: string, caption: string, accounts: { key: string; platform: string }[]) {
  const parsed = z
    .object({ p: z.uuid(), c: z.string().trim().min(3).max(5000), a: z.array(z.object({ key: z.uuid(), platform: z.string().max(20) })).min(2).max(20) })
    .safeParse({ p: projectId, c: caption, a: accounts });
  if (!parsed.success) return { error: "invalid_input" } as AiResult<never>;
  const brand = await brandFor(projectId);
  if (!brand) return { error: "not_found" } as AiResult<never>;
  const locale = await getLocale();
  return withCharge(projectId, "guionista.variations", caption, async () => (await captionVariations(brand, { caption, accounts, locale })).variations);
}
