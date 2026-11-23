import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { imageStyleHint } from "@/lib/ai/brand-context";
import { creditsFor, getModel, LICENSE_NOTE, MODELS, type Aspect } from "@/lib/ai/catalog";
import { falSubmit, isFalConfigured } from "@/lib/ai/providers/fal";
import { refundGeneration } from "@/lib/ai/settle";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Generación de imagen/vídeo del Estudio iniciada desde el MCP. Misma lógica que
 * src/app/app/(shell)/p/[projectId]/studio/actions.ts → startGeneration:
 *   1) cobro atómico e idempotente (mcp_start_ai_generation, comprueba rol editor),
 *   2) envío a la cola de fal.ai,
 *   3) si falla tras cobrar, reembolso (refundGeneration); si la petición se corta, la tarea `settle-stale-generations`
 *      cierra y devuelve. El resultado se recoge con settleStudioGeneration (herramienta get_generation).
 */
type Db = SupabaseClient<Database>;

export type StudioStart =
  | { ok: true; generationId: string; credits: number; model: string; alreadyStarted: boolean }
  | { ok: false; error: "not_configured" | "invalid_model" | "invalid_duration" | "image_required" | "banned_word" | "insufficient_credits" | "forbidden" | "provider_error" | "generic" };

/** Texto con los modelos y su coste en créditos, para las descripciones de las herramientas. */
export function modelsCostText(kind: "image" | "video") {
  return MODELS.filter((m) => m.kind === kind)
    .map((m) => {
      if (m.kind === "image") return `"${m.id}" (${m.label}, ${creditsFor(m)} créditos)`;
      const d = (m.durations ?? [5]).map((s) => `${s}s=${creditsFor(m, s)}`).join(", ");
      return `"${m.id}" (${m.label}${m.needsImage ? ", anima una imagen de la biblioteca: requiere source_asset_id" : ""}; créditos ${d})`;
    })
    .join("; ");
}

export async function startStudioGeneration(
  db: Db,
  a: {
    userId: string;
    project: { id: string; workspace_id: string };
    kind: "image" | "video";
    modelId: string;
    prompt: string;
    aspect: Aspect;
    duration?: number;
    sourceAssetId?: string;
    useBrandColors: boolean;
    idempotencyKey: string;
  },
): Promise<StudioStart> {
  const model = getModel(a.modelId);
  if (!model || model.kind !== a.kind) return { ok: false, error: "invalid_model" };
  if (!isFalConfigured()) return { ok: false, error: "not_configured" };
  if (model.kind === "video" && a.duration && !model.durations?.includes(a.duration)) return { ok: false, error: "invalid_duration" };
  if (model.needsImage && !a.sourceAssetId) return { ok: false, error: "image_required" };

  const { data: kit } = await db.from("brand_kits").select("tone_of_voice, target_audience, banned_words, colors").eq("project_id", a.project.id).maybeSingle();
  const colors = Array.isArray(kit?.colors) ? (kit.colors as { hex?: string }[]).map((c) => c.hex).filter((x): x is string => !!x) : [];
  const brand = { tone: kit?.tone_of_voice ?? "", audience: kit?.target_audience ?? "", bannedWords: kit?.banned_words ?? [], colors };
  if (brand.bannedWords.some((w) => w && a.prompt.toLowerCase().includes(w.toLowerCase()))) return { ok: false, error: "banned_word" };
  const prompt = [a.prompt, a.useBrandColors && model.kind === "image" ? imageStyleHint(brand) : ""].filter(Boolean).join(" ");

  // Imagen de partida: del mismo proyecto, URL firmada de 1 h.
  let imageUrl: string | undefined;
  if (model.needsImage) {
    const { data: src } = await db.from("assets").select("storage_path, mime_type").eq("id", a.sourceAssetId!).eq("project_id", a.project.id).maybeSingle();
    if (!src || !src.mime_type.startsWith("image/")) return { ok: false, error: "image_required" };
    const { data: signed } = await db.storage.from("project-media").createSignedUrl(src.storage_path, 3600);
    imageUrl = signed?.signedUrl;
    if (!imageUrl) return { ok: false, error: "image_required" };
  }

  const duration = model.kind === "video" ? (a.duration ?? model.durations?.[0]) : undefined;
  const credits = creditsFor(model, duration);
  const baseParams = { aspect: a.aspect, duration: duration ?? null, model_id: model.id, source_asset_id: a.sourceAssetId ?? null, via: "mcp" };
  const { data: generationId, error } = await db.rpc("mcp_start_ai_generation", {
    p_user_id: a.userId,
    p_project_id: a.project.id,
    p_kind: model.kind,
    p_provider: "fal",
    p_model: model.endpoint,
    p_prompt: prompt.slice(0, 4000),
    p_params: baseParams,
    p_credits: credits,
    p_license: { ...LICENSE_NOTE, modelPage: model.modelPage },
    p_idempotency_key: `mcp:${a.userId}:${a.idempotencyKey}`,
  });
  if (error || !generationId) return { ok: false, error: error?.message.includes("insufficient_credits") ? "insufficient_credits" : "forbidden" };

  const { data: gen } = await db.from("ai_generations").select("id, workspace_id, status, params").eq("id", generationId).single();
  if (!gen) return { ok: false, error: "generic" };
  // Reintento con la misma clave: no se cobra ni se envía otra vez.
  const already = (gen.params as { status_url?: string } | null)?.status_url;
  if (gen.status !== "running" || already) return { ok: true, generationId: gen.id, credits, model: model.label, alreadyStarted: true };

  try {
    const ticket = await falSubmit(model.endpoint, model.buildInput({ prompt, aspect: a.aspect, duration, imageUrl }));
    await db
      .from("ai_generations")
      .update({ provider_request_id: ticket.requestId, params: { ...baseParams, status_url: ticket.statusUrl, response_url: ticket.responseUrl } })
      .eq("id", gen.id);
    return { ok: true, generationId: gen.id, credits, model: model.label, alreadyStarted: false };
  } catch (e) {
    console.error("[mcp] fallo al enviar la generación", (e as Error).message?.slice(0, 60));
    await refundGeneration(db, gen.id, gen.workspace_id, credits, "provider_error");
    return { ok: false, error: "provider_error" };
  }
}
