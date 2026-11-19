"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AUDIO_LICENSE, getVoiceModel, MUSIC_DURATIONS, MUSIC_MODEL, musicCredits, voiceCredits } from "@/lib/ai/audio";
import { getBrandContext } from "@/lib/ai/brand-context";
import { composeMusic, isElevenLabsConfigured, listVoices, textToSpeech } from "@/lib/ai/providers/elevenlabs";
import { toErrorKey } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AudioResult = { ok: true; assetId: string } | { ok?: false; error: string };
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

/**
 * Patrón común: 1) cobra y registra la generación (atómico, idempotente), 2) llama a ElevenLabs,
 * 3) guarda el MP3 en Storage privado como asset "generado con IA". Si falla tras cobrar, devuelve los créditos.
 */
async function run(o: {
  projectId: string;
  kind: "audio" | "music";
  model: string;
  prompt: string;
  params: Record<string, unknown>;
  credits: number;
  idempotencyKey: string;
  generate: () => Promise<ArrayBuffer>;
}): Promise<AudioResult> {
  const admin = createAdminClient();
  if (!isElevenLabsConfigured() || !admin) return { error: "not_configured" };
  const supabase = await createClient();
  const ctx = await getBrandContext(o.projectId);
  if (ctx.bannedWords.some((w) => w && o.prompt.toLowerCase().includes(w.toLowerCase()))) return { error: "banned_word" };

  const { data: generationId, error } = await supabase.rpc("start_ai_generation", {
    p_project_id: o.projectId,
    p_kind: o.kind,
    p_provider: "elevenlabs",
    p_model: o.model,
    p_prompt: o.prompt.slice(0, 4000),
    p_params: o.params as never,
    p_credits: o.credits,
    p_license: AUDIO_LICENSE,
    p_idempotency_key: o.idempotencyKey,
  });
  if (error) return { error: error.message.includes("insufficient_credits") ? "insufficient_credits" : toErrorKey(error) };

  const { data: gen } = await admin.from("ai_generations").select("id, workspace_id, project_id, created_by, status").eq("id", generationId).single();
  if (!gen || gen.status !== "running") return { error: "generic" }; // reintento con la misma clave

  try {
    const bytes = await o.generate();
    const path = `${gen.workspace_id}/${gen.project_id}/${crypto.randomUUID()}.mp3`;
    const up = await admin.storage.from("project-media").upload(path, bytes, { contentType: "audio/mpeg" });
    if (up.error) throw new Error("storage_failed");
    const { data: asset, error: insErr } = await admin
      .from("assets")
      .insert({
        workspace_id: gen.workspace_id,
        project_id: gen.project_id,
        storage_path: path,
        mime_type: "audio/mpeg",
        size_bytes: bytes.byteLength,
        source: "ai",
        ai_generated: true,
        generation_id: gen.id,
        created_by: gen.created_by,
      })
      .select("id")
      .single();
    if (insErr || !asset) throw new Error("asset_failed");
    await admin.from("ai_generations").update({ status: "succeeded", completed_at: new Date().toISOString() }).eq("id", gen.id);
    revalidatePath(`/app/p/${o.projectId}/studio`);
    return { ok: true, assetId: asset.id };
  } catch (e) {
    console.error("[ai-audio] fallo al generar", (e as Error).message?.slice(0, 60));
    await refund(admin, gen.id, gen.workspace_id, o.credits, "provider_error");
    return { error: "provider_error" };
  }
}

const voiceSchema = z.object({
  projectId: z.uuid(),
  voiceId: z.string().regex(/^[A-Za-z0-9]{8,40}$/),
  modelId: z.string().max(40),
  text: z.string().trim().min(2).max(4000),
  idempotencyKey: z.uuid(),
});

/** Texto a voz con una voz de la biblioteca por defecto de ElevenLabs. */
export async function generateVoice(input: z.input<typeof voiceSchema>): Promise<AudioResult> {
  const parsed = voiceSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const model = getVoiceModel(d.modelId);
  if (!model || d.text.length > model.maxChars) return { error: "invalid_input" };
  // Solo voces de la biblioteca por defecto (nada de voces clonadas de terceros).
  const voices = await listVoices();
  const voice = voices.find((v) => v.id === d.voiceId);
  if (!voice) return { error: "invalid_voice" };
  return run({
    projectId: d.projectId,
    kind: "audio",
    model: model.id,
    prompt: d.text,
    params: { mode: "tts", voice_id: voice.id, voice_name: voice.name, chars: d.text.length },
    credits: voiceCredits(model, d.text.length),
    idempotencyKey: d.idempotencyKey,
    generate: () => textToSpeech({ voiceId: voice.id, text: d.text, modelId: model.id }),
  });
}

const musicSchema = z.object({
  projectId: z.uuid(),
  prompt: z.string().trim().min(3).max(1000),
  seconds: z.number().int().refine((n) => (MUSIC_DURATIONS as readonly number[]).includes(n)),
  instrumental: z.boolean(),
  idempotencyKey: z.uuid(),
});

/** Música a partir de una descripción (Eleven Music). */
export async function generateMusic(input: z.input<typeof musicSchema>): Promise<AudioResult> {
  const parsed = musicSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  return run({
    projectId: d.projectId,
    kind: "music",
    model: MUSIC_MODEL.id,
    prompt: d.prompt,
    params: { mode: "music", seconds: d.seconds, instrumental: d.instrumental, c2pa: true },
    credits: musicCredits(d.seconds),
    idempotencyKey: d.idempotencyKey,
    generate: () => composeMusic({ prompt: d.prompt, seconds: d.seconds, instrumental: d.instrumental, modelId: MUSIC_MODEL.id }),
  });
}
