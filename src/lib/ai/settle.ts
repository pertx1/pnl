import "server-only";
import { getModel, type AiModel } from "@/lib/ai/catalog";
import { downloadFalFile, falResult, falStatus, type FalFile } from "@/lib/ai/providers/fal";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cierre de generaciones del Estudio (imagen y vídeo) que van por la cola de fal.ai.
 * Lo usan la consulta del navegador (checkGeneration) y la tarea programada que barre las atascadas,
 * para que una generación cobrada siempre termine en "succeeded" o en "refunded".
 */
export type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
export type StudioGen = {
  id: string;
  workspace_id: string;
  project_id: string;
  created_by: string | null;
  status: string;
  params: unknown;
  credits_cost: number;
  created_at: string;
};
export type SettleResult = { status: "pending" } | { status: "done"; assetId: string } | { status: "failed" };

/** Tras este tiempo sin resultado, la generación se da por fallida y se devuelven los créditos. */
export const STUDIO_TIMEOUT_MS = 30 * 60_000;

export async function refundGeneration(admin: Admin, generationId: string, workspaceId: string, credits: number, code: string) {
  // Solo una vez: si ya no está "running", otra consulta la cerró antes.
  const { data: closed, error: closeError } = await admin
    .from("ai_generations")
    .update({ status: "refunded", error_code: code, completed_at: new Date().toISOString() })
    .eq("id", generationId)
    .eq("status", "running")
    .select("id");
  if (closeError) console.error("[ai] no se pudo cerrar la generación para devolverla", closeError.code ?? "", closeError.message?.slice(0, 80) ?? "");
  if (!closed?.length) return;
  if (credits > 0) {
    const { error: grantError } = await admin.rpc("grant_credits", {
      p_workspace_id: workspaceId,
      p_amount: credits,
      p_reason: "refund_ai_failure",
      p_idempotency_key: `refund:${generationId}`,
      p_ref_type: "ai_generation",
      p_ref_id: generationId,
    });
    if (grantError) console.error("[ai] no se pudieron devolver los créditos", grantError.code ?? "", grantError.message?.slice(0, 80) ?? "");
  }
}

/** Guarda el archivo generado en Storage privado y lo registra como asset "generado con IA". */
export async function storeOutput(admin: Admin, gen: Pick<StudioGen, "id" | "workspace_id" | "project_id" | "created_by">, model: AiModel, file: FalFile) {
  const { bytes, contentType } = await downloadFalFile(file.url);
  const type = file.content_type ?? contentType;
  const mime = model.kind === "video" ? "video/mp4" : type.includes("png") ? "image/png" : type.includes("webp") ? "image/webp" : "image/jpeg";
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

/** Consulta una generación del Estudio en cola y la cierra si ha terminado (o si lleva demasiado tiempo). */
export async function settleStudioGeneration(admin: Admin, gen: StudioGen): Promise<SettleResult> {
  if (gen.status === "succeeded") {
    const { data: a } = await admin.from("assets").select("id").eq("generation_id", gen.id).maybeSingle();
    return a ? { status: "done", assetId: a.id } : { status: "pending" };
  }
  if (gen.status !== "running") return { status: "failed" };

  const p = (gen.params ?? {}) as { status_url?: string; response_url?: string; model_id?: string };
  const model = getModel(p.model_id ?? "");
  const tooOld = Date.now() - new Date(gen.created_at).getTime() > STUDIO_TIMEOUT_MS;

  // Cobrada pero nunca enviada a fal.ai (p. ej. la petición se cortó): se devuelve al pasar el plazo.
  if (!p.status_url || !p.response_url || !model) {
    if (tooOld) {
      await refundGeneration(admin, gen.id, gen.workspace_id, gen.credits_cost, "stale");
      return { status: "failed" };
    }
    return { status: "pending" };
  }

  const st = await falStatus(p.status_url).catch(() => "ERROR" as const);
  if (st === "IN_QUEUE" || st === "IN_PROGRESS") {
    if (!tooOld) return { status: "pending" };
    await refundGeneration(admin, gen.id, gen.workspace_id, gen.credits_cost, "timeout");
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
    return { status: "done", assetId };
  } catch (e) {
    console.error("[ai] fallo al recoger el resultado", (e as Error).message?.slice(0, 60));
    await refundGeneration(admin, gen.id, gen.workspace_id, gen.credits_cost, "provider_error");
    return { status: "failed" };
  }
}
