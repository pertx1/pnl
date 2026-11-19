"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { isAgentsConfigured } from "@/lib/agents";
import { generateHooks, HOOKS_VERSION, remixDraft, REMIX_VERSION } from "@/lib/agents/hooks";
import { brandFor, withCharge } from "@/lib/research/charge";
import { RESEARCH_CREDITS } from "@/lib/research/credits";
import { fetchOembed } from "@/lib/research/oembed";
import { detectNetwork, normalizeTags, safeHttpsUrl } from "@/lib/research/parse";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; id?: string } | { ok?: false; error: string };

async function project(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("id, workspace_id").eq("id", projectId).is("archived_at", null).maybeSingle();
  return { supabase, project: data };
}

const KINDS = ["video", "ad", "post"] as const;
const swipeSchema = z.object({
  projectId: z.uuid(),
  url: z.string().trim().min(8).max(2000),
  kind: z.enum(KINDS),
  notes: z.string().max(5000),
  tags: z.string().max(1000),
});

/** Guarda un enlace en el swipe file: solo URL + metadatos públicos de oEmbed oficial + notas/etiquetas. */
export async function addSwipe(raw: z.input<typeof swipeSchema>): Promise<Result> {
  const parsed = swipeSchema.safeParse(raw);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const url = safeHttpsUrl(d.url);
  if (!url) return { error: "invalid_url" };
  const { supabase, project: p } = await project(d.projectId);
  if (!p) return { error: "not_found" };
  // Comprobar el rol antes de llamar a servicios externos (la RLS lo vuelve a comprobar al insertar).
  const { data: canEdit } = await supabase.rpc("has_workspace_role", { p_workspace_id: p.workspace_id, p_min_role: "editor" });
  if (!canEdit) return { error: "forbidden" };
  const network = detectNetwork(url);
  const meta = await fetchOembed(network, url);
  const user = (await supabase.auth.getUser()).data.user;
  const { data, error } = await supabase
    .from("research_swipes")
    .insert({
      workspace_id: p.workspace_id,
      project_id: p.id,
      url,
      network,
      kind: d.kind,
      title: meta?.title ?? null,
      author_name: meta?.authorName ?? null,
      thumbnail_url: meta?.thumbnailUrl ?? null,
      oembed_fetched_at: meta ? new Date().toISOString() : null,
      notes: d.notes,
      tags: normalizeTags(d.tags),
      created_by: user?.id,
    })
    .select("id")
    .single();
  if (error) return { error: "forbidden" };
  revalidatePath(`/app/p/${d.projectId}/inspiration`);
  return { ok: true, id: data.id };
}

export async function updateSwipe(raw: { swipeId: string; notes: string; tags: string; kind: string }): Promise<Result> {
  const parsed = z.object({ swipeId: z.uuid(), notes: z.string().max(5000), tags: z.string().max(1000), kind: z.enum(KINDS) }).safeParse(raw);
  if (!parsed.success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_swipes")
    .update({ notes: parsed.data.notes, tags: normalizeTags(parsed.data.tags), kind: parsed.data.kind })
    .eq("id", parsed.data.swipeId)
    .select("project_id");
  if (error || !data?.length) return { error: "forbidden" };
  revalidatePath(`/app/p/${data[0].project_id}/inspiration`);
  return { ok: true };
}

export async function deleteSwipe(swipeId: string): Promise<Result> {
  if (!z.uuid().safeParse(swipeId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("research_swipes").delete().eq("id", swipeId).select("project_id");
  if (error || !data?.length) return { error: "forbidden" };
  revalidatePath(`/app/p/${data[0].project_id}/inspiration`);
  return { ok: true };
}

const hookSchema = z.object({
  projectId: z.uuid(),
  text: z.string().trim().min(3).max(500),
  niche: z.string().trim().max(80),
  format: z.string().trim().max(40),
});

export async function addHook(raw: z.input<typeof hookSchema>): Promise<Result> {
  const parsed = hookSchema.safeParse(raw);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const { supabase, project: p } = await project(d.projectId);
  if (!p) return { error: "not_found" };
  const user = (await supabase.auth.getUser()).data.user;
  const { error } = await supabase
    .from("research_hooks")
    .insert({ workspace_id: p.workspace_id, project_id: p.id, text: d.text, niche: d.niche.toLowerCase(), format: d.format, source: "user", created_by: user?.id });
  if (error) return { error: "forbidden" };
  revalidatePath(`/app/p/${d.projectId}/inspiration`);
  return { ok: true };
}

export async function deleteHook(hookId: string): Promise<Result> {
  if (!z.uuid().safeParse(hookId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("research_hooks").delete().eq("id", hookId).select("project_id");
  if (error || !data?.length) return { error: "forbidden" };
  revalidatePath(`/app/p/${data[0].project_id}/inspiration`);
  return { ok: true };
}

/** Genera 10 hooks con IA para un nicho y formato y los guarda en la biblioteca (etiquetados como IA). */
export async function generateHooksAction(raw: { projectId: string; niche: string; format: string }): Promise<{ ok: true; count: number } | { ok?: false; error: string }> {
  const parsed = z.object({ projectId: z.uuid(), niche: z.string().trim().min(2).max(80), format: z.string().trim().min(2).max(40) }).safeParse(raw);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const { supabase, project: p } = await project(d.projectId);
  if (!p) return { error: "not_found" };
  const brand = await brandFor(d.projectId);
  if (!brand) return { error: "not_found" };
  const locale = await getLocale();
  const res = await withCharge(
    { projectId: d.projectId, agent: HOOKS_VERSION, prompt: `Hooks: ${d.niche} · ${d.format}`, credits: RESEARCH_CREDITS.generateHooks },
    () => generateHooks(brand, { niche: d.niche, format: d.format, locale }),
  );
  if (!res.ok) return { error: res.error };
  const user = (await supabase.auth.getUser()).data.user;
  const rows = res.data.hooks
    .map((h) => h.trim().slice(0, 500))
    .filter(Boolean)
    .map((text) => ({ workspace_id: p.workspace_id, project_id: p.id, text, niche: d.niche.toLowerCase(), format: d.format, source: "ai" as const, generation_id: res.generationId, created_by: user?.id }));
  const { error } = await supabase.from("research_hooks").insert(rows);
  if (error) return { error: "forbidden" };
  revalidatePath(`/app/p/${d.projectId}/inspiration`);
  return { ok: true, count: rows.length };
}

/**
 * "Crear algo parecido para mi marca": borrador de caption para el editor de posts.
 * Con IA (1 crédito) lo escribe el Guionista con el brand kit; sin IA, devuelve la nota del usuario (gratis).
 * El borrador NUNCA se publica solo: se abre en el editor y la persona lo revisa y aprueba.
 */
export async function remixSwipe(swipeId: string, useAi: boolean): Promise<{ ok: true; caption: string; ai: boolean } | { ok?: false; error: string }> {
  if (!z.uuid().safeParse(swipeId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: s } = await supabase.from("research_swipes").select("id, project_id, title, notes, network").eq("id", swipeId).maybeSingle();
  if (!s) return { error: "not_found" };
  const fallback = (s.notes || s.title || "").slice(0, 1500);
  if (!useAi || !isAgentsConfigured()) return { ok: true, caption: fallback, ai: false };
  const brand = await brandFor(s.project_id);
  if (!brand) return { error: "not_found" };
  const locale = await getLocale();
  const res = await withCharge(
    { projectId: s.project_id, agent: REMIX_VERSION, prompt: `Remix de inspiración (${s.network})`, credits: RESEARCH_CREDITS.remixDraft },
    () => remixDraft(brand, { title: s.title, notes: s.notes, network: s.network, locale }),
  );
  if (!res.ok) return { error: res.error };
  return { ok: true, caption: res.data.caption.slice(0, 1500), ai: true };
}
