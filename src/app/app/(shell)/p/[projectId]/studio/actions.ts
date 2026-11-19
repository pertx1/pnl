"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getBrandContext, imageStyleHint } from "@/lib/ai/brand-context";
import { creditsFor, getModel, LICENSE_NOTE, type AiModel } from "@/lib/ai/catalog";
import { downloadFalFile, falResult, falRun, falStatus, falSubmit, isFalConfigured, type FalFile } from "@/lib/ai/providers/fal";
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

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function refund(admin: Admin, generationId: string, workspaceId: string, credits: number, code: string) {
  await admin.from("ai_generations").update({ status: "refunded", error_code: code, completed_at: new Date().toISOString() }).eq("id", generationId);
  await admin.rpc("grant_credits", {
    p_workspace_id: workspaceId,
    p_amount: credits,
    p_reason: "refund_ai_failure",
    p_idempotency_key: `refund:${generationId}`,
    p_ref_type: "ai_generation",
    p_ref_id: generationId,
  });
}

/** Guarda el archivo generado en Storage privado y lo registra como asset "generado con IA". */
async function storeOutput(admin: Admin, gen: { id: string; workspace_id: string; project_id: string; created_by: string | null }, model: AiModel, file: FalFile) {
  const { bytes, contentType } = await downloadFalFile(file.url);
  const mime =
    model.kind === "video" ? "video/mp4" : (file.content_type ?? contentType).includes("png") ? "image/png" : (file.content_type ?? contentType).includes("webp") ? "image/webp" : "image/jpeg";
  const ext = { "video/mp4": "mp4", "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg" }[mime];
  const path = `${gen.workspace_id}/${gen.project_id}/${crypto.randomUUID()}.${ext}`;
  const up = await admin.storage.from("project-media").upload(path, bytes, { contentType: mime });
  if (up.error) throw up.error;
  const { data: asset, error } = await admin
    .from("assets")
    .insert({
      workspace_id: gen.workspace_id,
      project_id: gen.project_id,
      storage_path: path,
      mime_type: mime,
      size_bytes: bytes.byteLength,
      width: file.width ?? null,
      height: file.height ?? null,
      source: "ai",
      ai_generated: true,
      generation_id: gen.id,
      created_by: gen.created_by,
    })
    .select("id")
    .single();
  if (error) throw error;
  await admin.from("ai_generations").update({ status: "succeeded", completed_at: new Date().toISOString() }).eq("id", gen.id);
  return asset.id;
}

/**
 * Inicia una generación: 1) cobra créditos y la registra (atómico e idempotente), 2) llama a fal.ai.
 * Imagen → espera el resultado. Vídeo → la deja en cola y el navegador consulta `checkGeneration`.
 * Si algo falla tras cobrar, se devuelven los créditos.
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

  const { data: gen } = await admin.from("ai_generations").select("id, workspace_id, project_id, created_by, status").eq("id", generationId).single();
  if (!gen) return { error: "generic" };
  if (gen.status !== "running") return { error: "generic" }; // reintento con la misma clave: ya procesada

  const falInput = model.buildInput({ prompt, aspect: d.aspect, duration: d.duration, imageUrl });
  try {
    if (model.kind === "image") {
      const out = await falRun(model.endpoint, falInput);
      const file = out.images?.[0];
      if (!file) throw new Error("fal_empty");
      const assetId = await storeOutput(admin, gen, model, file);
      revalidatePath(`/app/p/${d.projectId}/studio`);
      return { ok: true, status: "done", assetId };
    }
    const ticket = await falSubmit(model.endpoint, falInput);
    await admin
      .from("ai_generations")
      .update({ provider_request_id: ticket.requestId, params: { aspect: d.aspect, duration: d.duration ?? null, model_id: model.id, status_url: ticket.statusUrl, response_url: ticket.responseUrl } })
      .eq("id", gen.id);
    return { ok: true, status: "pending", generationId: gen.id };
  } catch (e) {
    console.error("[ai] fallo al generar", (e as Error).message?.slice(0, 60));
    await refund(admin, gen.id, gen.workspace_id, credits, "provider_error");
    return { error: "provider_error" };
  }
}

export type CheckResult = { status: "pending" } | { status: "done"; assetId: string } | { status: "failed" };

/** Consulta una generación de vídeo en cola. Al terminar guarda el vídeo (solo una vez) o devuelve los créditos. */
export async function checkGeneration(generationId: string): Promise<CheckResult> {
  if (!z.uuid().safeParse(generationId).success) return { status: "failed" };
  const supabase = await createClient();
  // RLS: el usuario solo ve generaciones de sus workspaces.
  const { data: visible } = await supabase.from("ai_generations").select("id, project_id").eq("id", generationId).maybeSingle();
  const admin = createAdminClient();
  if (!visible || !admin) return { status: "failed" };

  const { data: gen } = await admin
    .from("ai_generations")
    .select("id, workspace_id, project_id, created_by, status, params, credits_cost, created_at")
    .eq("id", generationId)
    .single();
  if (!gen) return { status: "failed" };
  if (gen.status === "succeeded") {
    const { data: a } = await admin.from("assets").select("id").eq("generation_id", gen.id).maybeSingle();
    return a ? { status: "done", assetId: a.id } : { status: "pending" };
  }
  if (gen.status !== "running") return { status: "failed" };

  const p = (gen.params ?? {}) as { status_url?: string; response_url?: string; model_id?: string };
  const model = getModel(p.model_id ?? "");
  if (!p.status_url || !p.response_url || !model) return { status: "pending" };

  const tooOld = Date.now() - new Date(gen.created_at).getTime() > 30 * 60_000;
  const st = await falStatus(p.status_url).catch(() => "ERROR" as const);
  if (st === "IN_QUEUE" || st === "IN_PROGRESS") {
    if (!tooOld) return { status: "pending" };
    await refund(admin, gen.id, gen.workspace_id, gen.credits_cost, "timeout");
    return { status: "failed" };
  }

  // Reclamar el resultado una sola vez aunque haya varias consultas a la vez.
  const { data: claimed } = await admin
    .from("ai_generations")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", gen.id)
    .eq("status", "running")
    .is("completed_at", null)
    .select("id");
  if (!claimed?.length) return { status: "pending" };

  try {
    if (st !== "COMPLETED") throw new Error("fal_status_error");
    const out = await falResult(p.response_url);
    const file = out.video ?? out.images?.[0];
    if (!file) throw new Error("fal_empty");
    const assetId = await storeOutput(admin, gen, model, file);
    revalidatePath(`/app/p/${gen.project_id}/studio`);
    return { status: "done", assetId };
  } catch (e) {
    console.error("[ai] fallo al recoger el vídeo", (e as Error).message?.slice(0, 60));
    await refund(admin, gen.id, gen.workspace_id, gen.credits_cost, "provider_error");
    return { status: "failed" };
  }
}
