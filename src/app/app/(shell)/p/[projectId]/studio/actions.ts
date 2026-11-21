"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getBrandContext, imageStyleHint } from "@/lib/ai/brand-context";
import { creditsFor, getModel, LICENSE_NOTE } from "@/lib/ai/catalog";
import { falSubmit, isFalConfigured } from "@/lib/ai/providers/fal";
import { refundGeneration, settleStudioGeneration } from "@/lib/ai/settle";
import { toErrorKey } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  projectId: z.uuid(),
  modelId: z.string().max(40),
  prompt: z.string().trim().min(3).max(1500),
  aspect: z.enum(["1:1", "9:16", "16:9", "4:5"]),
  duration: z.number().int().min(1).max(15).optional(),
  sourceAssetId: z.uuid().optional(),
  useBrandColors: z.boolean(),
  idempotencyKey: z.uuid(),
});

export type StartResult =
  | { ok: true; status: "done"; assetId: string }
  | { ok: true; status: "pending"; generationId: string }
  | { ok?: false; error: string };

/**
 * Inicia una generación: 1) cobra créditos y la registra (atómico e idempotente), 2) la envía a la cola de fal.ai.
 * Imagen y vídeo van por la cola: la petición termina en segundos y el navegador consulta `checkGeneration`.
 * Si algo falla tras cobrar, se devuelven los créditos; si la petición se corta, la tarea programada
 * `settle-stale-generations` las cierra y devuelve los créditos.
 */
export async function startGeneration(input: z.input<typeof schema>): Promise<StartResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const model = getModel(d.modelId);
  const admin = createAdminClient();
  if (!model || !isFalConfigured() || !admin) return { error: "not_configured" };
  if (model.kind === "video" && d.duration && !model.durations?.includes(d.duration)) return { error: "invalid_input" };
  if (model.needsImage && !d.sourceAssetId) return { error: "image_required" };

  const supabase = await createClient();
  const ctx = await getBrandContext(d.projectId);
  if (ctx.bannedWords.some((w) => d.prompt.toLowerCase().includes(w.toLowerCase()))) return { error: "banned_word" };
  const prompt = [d.prompt, d.useBrandColors && model.kind === "image" ? imageStyleHint(ctx) : ""].filter(Boolean).join(" ");

  // Imagen de partida (imagen → vídeo): debe ser del mismo proyecto (RLS) y se pasa como URL firmada de 1 h.
  let imageUrl: string | undefined;
  if (model.needsImage) {
    const { data: src } = await supabase.from("assets").select("storage_path, mime_type").eq("id", d.sourceAssetId!).eq("project_id", d.projectId).maybeSingle();
    if (!src || !src.mime_type.startsWith("image/")) return { error: "image_required" };
    const { data: signed } = await supabase.storage.from("project-media").createSignedUrl(src.storage_path, 3600);
    imageUrl = signed?.signedUrl;
    if (!imageUrl) return { error: "image_required" };
  }

  const credits = creditsFor(model, d.duration);
  const { data: generationId, error } = await supabase.rpc("start_ai_generation", {
    p_project_id: d.projectId,
    p_kind: model.kind,
    p_provider: "fal",
    p_model: model.endpoint,
    p_prompt: prompt,
    p_params: { aspect: d.aspect, duration: d.duration ?? null, model_id: model.id, source_asset_id: d.sourceAssetId ?? null },
    p_credits: credits,
    p_license: { ...LICENSE_NOTE, modelPage: model.modelPage },
    p_idempotency_key: d.idempotencyKey,
  });
  if (error) return { error: error.message.includes("insufficient_credits") ? "insufficient_credits" : toErrorKey(error) };

  const { data: gen, error: readError } = await admin.from("ai_generations").select("id, workspace_id, project_id, created_by, status").eq("id", generationId).single();
  if (!gen) {
    // Sin poder leerla con la clave de servidor no se puede enviar ni devolver: queda para el barrido programado.
    console.error("[ai] no se pudo leer la generación con la clave de servidor", readError?.code ?? "", readError?.message?.slice(0, 80) ?? "");
    return { error: "generic" };
  }
  if (gen.status !== "running") return { error: "generic" }; // reintento con la misma clave: ya procesada

  const falInput = model.buildInput({ prompt, aspect: d.aspect, duration: d.duration, imageUrl });
  try {
    const ticket = await falSubmit(model.endpoint, falInput);
    await admin
      .from("ai_generations")
      .update({ provider_request_id: ticket.requestId, params: { aspect: d.aspect, duration: d.duration ?? null, model_id: model.id, status_url: ticket.statusUrl, response_url: ticket.responseUrl } })
      .eq("id", gen.id);
    return { ok: true, status: "pending", generationId: gen.id };
  } catch (e) {
    console.error("[ai] fallo al enviar la generación", (e as Error).message?.slice(0, 60));
    await refundGeneration(admin, gen.id, gen.workspace_id, credits, "provider_error");
    return { error: "provider_error" };
  }
}

export type CheckResult = { status: "pending" } | { status: "done"; assetId: string } | { status: "failed" };

/** Consulta una generación en cola (imagen o vídeo). Al terminar guarda el resultado (solo una vez) o devuelve los créditos. */
export async function checkGeneration(generationId: string): Promise<CheckResult> {
  if (!z.uuid().safeParse(generationId).success) return { status: "failed" };
  const supabase = await createClient();
  // RLS: el usuario solo ve generaciones de sus workspaces.
  const { data: visible } = await supabase.from("ai_generations").select("id").eq("id", generationId).maybeSingle();
  const admin = createAdminClient();
  if (!visible || !admin) return { status: "failed" };
  const { data: gen } = await admin
    .from("ai_generations")
    .select("id, workspace_id, project_id, created_by, status, params, credits_cost, created_at")
    .eq("id", generationId)
    .single();
  if (!gen) return { status: "failed" };
  const res = await settleStudioGeneration(admin, gen);
  if (res.status === "done") revalidatePath(`/app/p/${gen.project_id}/studio`);
  return res;
}
