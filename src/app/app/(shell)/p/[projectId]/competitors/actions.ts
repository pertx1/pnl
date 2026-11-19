"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { analyzeCompetitor, ANALISTA_VERSION, type CompetitorAnalysis } from "@/lib/agents/analista";
import { brandFor, withCharge, type AiResult } from "@/lib/research/charge";
import { RESEARCH_CREDITS } from "@/lib/research/credits";
import { errorCode } from "@/lib/research/http";
import { averagePerWeek, findOutliers, performanceValue, postsPerWeek } from "@/lib/research/metrics";
import { getProvider } from "@/lib/research/providers";
import { derivedAllowed, instagramContext, pickInstagramAccount, refreshCompetitor, writeSnapshot } from "@/lib/research/sync";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; id?: string } | { ok?: false; error: string };

const MAX_COMPETITORS_PER_PROJECT = 50;
const MANUAL_REFRESH_MIN_MS = 10 * 60_000;

/** Proyecto visible por RLS + rol del usuario en su workspace (la base de datos lo vuelve a comprobar). */
async function projectAccess(projectId: string) {
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("id, workspace_id").eq("id", projectId).is("archived_at", null).maybeSingle();
  if (!project) return null;
  const { data: canEdit } = await supabase.rpc("has_workspace_role", { p_workspace_id: project.workspace_id, p_min_role: "editor" });
  return { supabase, project, canEdit: Boolean(canEdit) };
}

const followSchema = z.object({
  projectId: z.uuid(),
  platform: z.enum(["youtube", "instagram", "tiktok"]),
  input: z.string().trim().min(2).max(300),
});

/** Busca un perfil público con la API oficial de su red y lo sigue en el proyecto. */
export async function followCompetitor(raw: z.input<typeof followSchema>): Promise<Result> {
  const parsed = followSchema.safeParse(raw);
  if (!parsed.success) return { error: "invalid_input" };
  const { projectId, platform, input } = parsed.data;
  const access = await projectAccess(projectId);
  if (!access) return { error: "not_found" };
  if (!access.canEdit) return { error: "forbidden" };
  const { supabase, project } = access;

  const provider = getProvider(platform);
  if (provider.availability !== "official") return { error: "coming_soon" };
  if (!provider.isConfigured()) return { error: "not_configured" };

  const { count } = await supabase.from("research_competitors").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  if ((count ?? 0) >= MAX_COMPETITORS_PER_PROJECT) return { error: "limit_reached" };

  try {
    const viaAccount = platform === "instagram" ? await pickInstagramAccount(supabase, projectId) : null;
    if (platform === "instagram" && !viaAccount) return { error: "needs_connected_account" };
    const ctx = platform === "instagram" ? await instagramContext(supabase, viaAccount) : {};
    const snap = await provider.lookup(input, ctx);

    const { data: existing } = await supabase
      .from("research_competitors")
      .select("id")
      .eq("project_id", projectId)
      .eq("platform", platform)
      .eq("external_id", snap.externalId)
      .maybeSingle();
    if (existing) return { error: "already_following" };

    const { data: row, error } = await supabase
      .from("research_competitors")
      .insert({
        workspace_id: project.workspace_id,
        project_id: projectId,
        platform,
        external_id: snap.externalId,
        handle: snap.handle,
        via_social_account_id: viaAccount,
        created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      })
      .select("id, workspace_id, project_id, platform, last_fetched_at")
      .single();
    if (error || !row) return { error: "forbidden" };
    await writeSnapshot(supabase, row, snap);
    revalidatePath(`/app/p/${projectId}/competitors`);
    return { ok: true, id: row.id };
  } catch (e) {
    const code = errorCode(e);
    console.error("[research] seguir competidor", platform, code);
    return { error: code };
  }
}

export async function refreshCompetitorNow(competitorId: string): Promise<Result> {
  if (!z.uuid().safeParse(competitorId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: c } = await supabase.from("research_competitors").select("*").eq("id", competitorId).maybeSingle();
  if (!c) return { error: "not_found" };
  const access = await projectAccess(c.project_id);
  if (!access?.canEdit) return { error: "forbidden" };
  if (c.last_fetched_at && Date.now() - Date.parse(c.last_fetched_at) < MANUAL_REFRESH_MIN_MS) return { error: "too_soon" };
  const r = await refreshCompetitor(supabase, c);
  revalidatePath(`/app/p/${c.project_id}/competitors`);
  revalidatePath(`/app/p/${c.project_id}/competitors/${c.id}`);
  return r.ok ? { ok: true } : { error: r.code };
}

/** Deja de seguir: borra el competidor y, en cascada, sus publicaciones, alertas (y sus análisis). */
export async function unfollowCompetitor(competitorId: string): Promise<Result> {
  if (!z.uuid().safeParse(competitorId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: c } = await supabase.from("research_competitors").select("id, project_id").eq("id", competitorId).maybeSingle();
  if (!c) return { error: "not_found" };
  const { error, count } = await supabase.from("research_competitors").delete({ count: "exact" }).eq("id", competitorId);
  if (error || !count) return { error: "forbidden" };
  await supabase.from("research_analyses").delete().eq("subject_type", "competitor").eq("subject_id", competitorId);
  revalidatePath(`/app/p/${c.project_id}/competitors`);
  return { ok: true };
}

export async function markAlertsSeen(projectId: string): Promise<Result> {
  if (!z.uuid().safeParse(projectId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { error } = await supabase.from("research_alerts").update({ seen_at: new Date().toISOString() }).eq("project_id", projectId).is("seen_at", null);
  if (error) return { error: "forbidden" };
  revalidatePath(`/app/p/${projectId}/competitors`);
  return { ok: true };
}

/** Analista de competencia (IA). Cobra RESEARCH_CREDITS.analyzeCompetitor créditos; se devuelven si falla. */
export async function analyzeCompetitorAction(competitorId: string): Promise<AiResult<CompetitorAnalysis>> {
  if (!z.uuid().safeParse(competitorId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("research_competitors")
    .select("id, workspace_id, project_id, platform, display_name, handle, followers, media_count")
    .eq("id", competitorId)
    .maybeSingle();
  if (!c) return { error: "not_found" };
  const { data: posts } = await supabase
    .from("research_competitor_posts")
    .select("id, title, published_at, views, likes, comments")
    .eq("competitor_id", competitorId)
    .order("published_at", { ascending: false })
    .limit(40);
  if (!posts?.length) return { error: "no_data" };
  const brand = await brandFor(c.project_id);
  if (!brand) return { error: "not_found" };
  const locale = await getLocale();

  const derived = derivedAllowed(c.platform);
  const multiples = new Map(
    derived ? findOutliers(posts.map((p) => ({ id: p.id, publishedAt: p.published_at, value: performanceValue(p) }))).outliers.map((o) => [o.post.id, o.multiple]) : [],
  );
  const name = c.display_name ?? c.handle ?? "competidor";
  const res = await withCharge(
    { projectId: c.project_id, agent: ANALISTA_VERSION, prompt: `Análisis de competencia: ${name} (${c.platform})`, credits: RESEARCH_CREDITS.analyzeCompetitor },
    () =>
      analyzeCompetitor(brand, {
        platform: c.platform,
        name,
        followers: c.followers,
        mediaCount: c.media_count,
        postsPerWeek: derived ? averagePerWeek(postsPerWeek(posts.map((p) => p.published_at))) : null,
        posts: posts.map((p) => ({ title: p.title ?? "", publishedAt: p.published_at, views: p.views, likes: p.likes, comments: p.comments, outlierMultiple: multiples.get(p.id) ?? null })),
        locale,
      }),
  );
  if (res.ok) {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    await supabase.from("research_analyses").insert({
      workspace_id: c.workspace_id,
      project_id: c.project_id,
      subject_type: "competitor",
      subject_id: c.id,
      agent_version: ANALISTA_VERSION,
      result: res.data,
      generation_id: res.generationId,
      created_by: userId,
    });
    revalidatePath(`/app/p/${c.project_id}/competitors/${c.id}`);
  }
  return res;
}
