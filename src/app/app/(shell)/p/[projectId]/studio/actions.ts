"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getBrandContext, imageStyleHint } from "@/lib/ai/brand-context";
import { ASPECTS, getImageModel } from "@/lib/ai/catalog";
import { falGenerateImage, isFalConfigured } from "@/lib/ai/providers/fal";
import { toErrorKey } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  projectId: z.uuid(),
  modelId: z.string(),
  prompt: z.string().trim().min(3).max(1500),
  aspect: z.enum(["square", "portrait", "landscape", "story"]),
  useBrandColors: z.boolean(),
  idempotencyKey: z.uuid(),
});

export type GenerateResult = { ok: true; assetId: string } | { ok?: false; error: string };

/**
 * Genera una imagen: 1) cobra créditos y registra la generación (atómico, idempotente),
 * 2) llama al proveedor, 3) guarda el archivo en Storage privado como asset "generado con IA".
 * Si algo falla tras cobrar, se devuelven los créditos.
 */
export async function generateImage(input: z.input<typeof schema>): Promise<GenerateResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const model = getImageModel(d.modelId);
  const admin = createAdminClient();
  if (!model || !isFalConfigured() || !admin) return { error: "not_configured" };

  const supabase = await createClient();
  const ctx = await getBrandContext(d.projectId);
  // Palabras prohibidas del brand kit: no se envían a generar.
  const banned = ctx.bannedWords.find((w) => d.prompt.toLowerCase().includes(w.toLowerCase()));
  if (banned) return { error: "banned_word" };
  const prompt = [d.prompt, d.useBrandColors ? imageStyleHint(ctx) : ""].filter(Boolean).join(" ");

  const { data: generationId, error } = await supabase.rpc("start_ai_generation", {
    p_project_id: d.projectId,
    p_kind: "image",
    p_provider: model.provider,
    p_model: model.endpoint,
    p_prompt: prompt,
    p_params: { aspect: d.aspect },
    p_credits: model.credits,
    p_license: model.license,
    p_idempotency_key: d.idempotencyKey,
  });
  if (error) return { error: error.message.includes("insufficient_credits") ? "insufficient_credits" : toErrorKey(error) };

  const { data: gen } = await admin.from("ai_generations").select("workspace_id, status, created_by").eq("id", generationId).single();
  if (!gen) return { error: "generic" };

  try {
    const out = await falGenerateImage(model.endpoint, { prompt, image_size: ASPECTS[d.aspect], num_images: 1, enable_safety_checker: true });
    const img = out.images[0];
    const bytes = await (await fetch(img.url, { signal: AbortSignal.timeout(30_000) })).arrayBuffer();
    const mime = img.content_type === "image/png" ? "image/png" : "image/jpeg";
    const path = `${gen.workspace_id}/${d.projectId}/${crypto.randomUUID()}.${mime === "image/png" ? "png" : "jpg"}`;
    const up = await admin.storage.from("project-media").upload(path, bytes, { contentType: mime });
    if (up.error) throw up.error;
    const { data: asset, error: aErr } = await admin
      .from("assets")
      .insert({
        workspace_id: gen.workspace_id,
        project_id: d.projectId,
        storage_path: path,
        mime_type: mime,
        size_bytes: bytes.byteLength,
        width: img.width ?? null,
        height: img.height ?? null,
        source: "ai",
        ai_generated: true,
        generation_id: generationId,
        created_by: gen.created_by,
      })
      .select("id")
      .single();
    if (aErr) throw aErr;
    await admin.from("ai_generations").update({ status: "succeeded", provider_request_id: out.requestId ?? null, completed_at: new Date().toISOString() }).eq("id", generationId);
    revalidatePath(`/app/p/${d.projectId}/studio`);
    return { ok: true, assetId: asset.id };
  } catch (e) {
    console.error("[ai] generación fallida", (e as Error).message?.slice(0, 80));
    await admin.from("ai_generations").update({ status: "refunded", error_code: "provider_error", completed_at: new Date().toISOString() }).eq("id", generationId);
    await admin.rpc("grant_credits", {
      p_workspace_id: gen.workspace_id,
      p_amount: model.credits,
      p_reason: "refund_ai_failure",
      p_idempotency_key: `refund:${generationId}`,
      p_ref_type: "ai_generation",
      p_ref_id: generationId,
    });
    revalidatePath(`/app/p/${d.projectId}/studio`);
    return { error: "provider_error" };
  }
}
