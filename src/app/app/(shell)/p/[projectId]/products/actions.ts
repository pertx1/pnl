"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { analyzeProduct, CAZADOR_VERSION, type ProductAnalysis } from "@/lib/agents/cazador";
import { getAdSource, type AdResult } from "@/lib/research/ads";
import { brandFor, withCharge, type AiResult } from "@/lib/research/charge";
import { RESEARCH_CREDITS } from "@/lib/research/credits";
import { errorCode } from "@/lib/research/http";
import { computeMargin } from "@/lib/research/margin";
import { EU_COUNTRIES, safeHttpsUrl } from "@/lib/research/parse";
import { countVariantsByPage, winningScore, type ScoreFactor } from "@/lib/research/score";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; id?: string } | { ok?: false; error: string };
export type ScoredAd = AdResult & { score: number; factors: ScoreFactor[]; variants: number };

async function project(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("id, workspace_id").eq("id", projectId).is("archived_at", null).maybeSingle();
  return { supabase, project: data };
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined));
const searchSchema = z.object({
  projectId: z.uuid(),
  terms: z.string().trim().min(2).max(100),
  country: z.enum(EU_COUNTRIES),
  language: z.string().regex(/^[a-z]{2}$/).optional().or(z.literal("").transform(() => undefined)),
  dateMin: date,
  dateMax: date,
  status: z.enum(["ACTIVE", "ALL", "INACTIVE"]),
  platform: z.enum(["FACEBOOK", "INSTAGRAM", "AUDIENCE_NETWORK", "MESSENGER", "THREADS", "WHATSAPP"]).optional().or(z.literal("").transform(() => undefined)),
  exactPhrase: z.boolean().optional(),
  after: z.string().max(500).optional(),
});

/** Busca en la Meta Ad Library (datos de transparencia) y puntúa cada anuncio. No guarda nada. */
export async function searchAds(raw: z.input<typeof searchSchema>): Promise<{ ok: true; ads: ScoredAd[]; nextCursor: string | null } | { ok?: false; error: string }> {
  const parsed = searchSchema.safeParse(raw);
  if (!parsed.success) return { error: "invalid_input" };
  const { projectId, ...q } = parsed.data;
  const { project: p } = await project(projectId);
  if (!p) return { error: "not_found" };
  const source = getAdSource();
  if (!source?.isConfigured()) return { error: "not_configured" };
  try {
    const { ads, nextCursor } = await source.search(q);
    const variants = countVariantsByPage(ads);
    const now = Date.now();
    const scored = ads
      .map((a) => {
        const v = variants.get(a.pageId) ?? 1;
        const s = winningScore({ startedAt: a.startedAt, stoppedAt: a.stoppedAt, variants: v, platforms: a.platforms.length, countries: a.countries.length, euReach: a.euReach, now });
        return { ...a, score: s.score, factors: s.factors, variants: v };
      })
      .sort((a, b) => b.score - a.score);
    return { ok: true, ads: scored, nextCursor };
  } catch (e) {
    const code = errorCode(e);
    console.error("[research] ad library", code);
    return { error: code };
  }
}

export async function createList(projectId: string, name: string): Promise<Result> {
  const parsed = z.object({ p: z.uuid(), n: z.string().trim().min(1).max(80) }).safeParse({ p: projectId, n: name });
  if (!parsed.success) return { error: "invalid_input" };
  const { supabase, project: p } = await project(projectId);
  if (!p) return { error: "not_found" };
  const user = (await supabase.auth.getUser()).data.user;
  const { data, error } = await supabase.from("research_product_lists").insert({ workspace_id: p.workspace_id, project_id: p.id, name: parsed.data.n, created_by: user?.id }).select("id").single();
  if (error) return { error: error.code === "23505" ? "duplicate" : "forbidden" };
  revalidatePath(`/app/p/${projectId}/products`);
  return { ok: true, id: data.id };
}

export async function deleteList(listId: string): Promise<Result> {
  if (!z.uuid().safeParse(listId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("research_product_lists").delete().eq("id", listId).select("project_id");
  if (error || !data?.length) return { error: "forbidden" };
  revalidatePath(`/app/p/${data[0].project_id}/products`);
  return { ok: true };
}

const adSchema = z.object({
  id: z.string().max(64),
  pageName: z.string().max(300),
  bodies: z.array(z.string().max(600)).max(3),
  linkTitles: z.array(z.string().max(200)).max(3),
  libraryUrl: z.string().max(2000),
  startedAt: z.string().max(40).nullable(),
  stoppedAt: z.string().max(40).nullable(),
  platforms: z.array(z.string().max(30)).max(10),
  countries: z.array(z.string().max(80)).max(50),
  euReach: z.number().nullable(),
  variants: z.number().int().min(1).max(500),
});

const saveSchema = z.object({
  projectId: z.uuid(),
  listId: z.uuid().nullable(),
  title: z.string().trim().min(1).max(200),
  ad: adSchema.optional(),
});

/** Guarda un producto (desde un anuncio de la Ad Library o manual). La puntuación se recalcula en el servidor. */
export async function saveProduct(raw: z.input<typeof saveSchema>): Promise<Result> {
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const { supabase, project: p } = await project(d.projectId);
  if (!p) return { error: "not_found" };
  const user = (await supabase.auth.getUser()).data.user;
  const ad = d.ad;
  const libraryUrl = ad ? safeHttpsUrl(ad.libraryUrl) : null;
  if (ad && (!libraryUrl || !libraryUrl.startsWith("https://www.facebook.com/ads/library/"))) return { error: "invalid_input" };
  const s = ad
    ? winningScore({ startedAt: ad.startedAt, stoppedAt: ad.stoppedAt, variants: ad.variants, platforms: ad.platforms.length, countries: ad.countries.length, euReach: ad.euReach })
    : null;
  const { data, error } = await supabase
    .from("research_products")
    .insert({
      workspace_id: p.workspace_id,
      project_id: p.id,
      list_id: d.listId,
      title: d.title,
      source: ad ? "meta_ad_library" : "manual",
      ad_archive_id: ad?.id ?? null,
      page_name: ad?.pageName ?? null,
      ad_snapshot_url: libraryUrl,
      ad_text: ad ? [...ad.linkTitles, ...ad.bodies].join("\n\n").slice(0, 4000) : null,
      platforms: ad?.platforms ?? [],
      countries: ad?.countries ?? [],
      ad_started_at: ad?.startedAt ?? null,
      score: s?.score ?? null,
      score_breakdown: s ? { factors: s.factors } : {},
      created_by: user?.id,
    })
    .select("id")
    .single();
  if (error) return { error: "forbidden" };
  revalidatePath(`/app/p/${d.projectId}/products`);
  return { ok: true, id: data.id };
}

const money = z.number().min(0).max(1_000_000).nullable();
const updateSchema = z.object({
  productId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(5000),
  supplierUrl: z.string().max(2000),
  listId: z.uuid().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  salePrice: money,
  unitCost: money,
  shippingCost: money,
  feePct: z.number().min(0).max(100).nullable(),
  cpa: money,
});

export async function updateProduct(raw: z.input<typeof updateSchema>): Promise<Result> {
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  const supplier = d.supplierUrl.trim() ? safeHttpsUrl(d.supplierUrl) : null;
  if (d.supplierUrl.trim() && !supplier) return { error: "invalid_url" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_products")
    .update({
      title: d.title,
      notes: d.notes,
      supplier_url: supplier,
      list_id: d.listId,
      currency: d.currency,
      sale_price: d.salePrice,
      unit_cost: d.unitCost,
      shipping_cost: d.shippingCost,
      fee_pct: d.feePct,
      cpa: d.cpa,
    })
    .eq("id", d.productId)
    .select("project_id");
  if (error || !data?.length) return { error: "forbidden" };
  revalidatePath(`/app/p/${data[0].project_id}/products`);
  return { ok: true };
}

export async function deleteProduct(productId: string): Promise<Result> {
  if (!z.uuid().safeParse(productId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("research_products").delete().eq("id", productId).select("project_id");
  if (error || !data?.length) return { error: "forbidden" };
  await supabase.from("research_analyses").delete().eq("subject_type", "product").eq("subject_id", productId);
  revalidatePath(`/app/p/${data[0].project_id}/products`);
  return { ok: true };
}

/** Cazador de productos (IA). Cobra RESEARCH_CREDITS.analyzeProduct créditos; se devuelven si falla. */
export async function analyzeProductAction(productId: string): Promise<AiResult<ProductAnalysis>> {
  if (!z.uuid().safeParse(productId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: pr } = await supabase.from("research_products").select("*").eq("id", productId).maybeSingle();
  if (!pr) return { error: "not_found" };
  const brand = await brandFor(pr.project_id);
  if (!brand) return { error: "not_found" };
  const locale = await getLocale();
  const factors = ((pr.score_breakdown as { factors?: ScoreFactor[] })?.factors ?? []).map((f) => `${f.key}: ${f.points}/${f.max} (valor ${f.value ?? "n/d"})`).join("; ");
  const hasMargin = pr.sale_price !== null;
  const m = hasMargin
    ? computeMargin({ salePrice: pr.sale_price ?? 0, unitCost: pr.unit_cost ?? 0, shipping: pr.shipping_cost ?? 0, feePct: pr.fee_pct ?? 0, cpa: pr.cpa ?? 0 })
    : null;
  const margin = m
    ? `precio ${pr.sale_price} ${pr.currency}, coste ${pr.unit_cost ?? 0}, envío ${pr.shipping_cost ?? 0}, comisión ${pr.fee_pct ?? 0} %, CPA ${pr.cpa ?? 0} → margen ${m.margin} ${pr.currency} (${m.marginPct ?? "n/d"} %), CPA máximo ${m.breakEvenCpa}`
    : "sin datos (el usuario no ha rellenado la calculadora)";

  const res = await withCharge(
    { projectId: pr.project_id, agent: CAZADOR_VERSION, prompt: `Análisis de producto: ${pr.title}`, credits: RESEARCH_CREDITS.analyzeProduct },
    () =>
      analyzeProduct(brand, {
        title: pr.title,
        notes: pr.notes,
        adText: pr.ad_text,
        pageName: pr.page_name,
        platforms: pr.platforms,
        countries: pr.countries,
        startedAt: pr.ad_started_at,
        score: pr.score,
        scoreFactors: factors || "n/d",
        margin,
        locale,
      }),
  );
  if (res.ok) {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    await supabase.from("research_analyses").insert({
      workspace_id: pr.workspace_id,
      project_id: pr.project_id,
      subject_type: "product",
      subject_id: pr.id,
      agent_version: CAZADOR_VERSION,
      result: res.data,
      generation_id: res.generationId,
      created_by: userId,
    });
    revalidatePath(`/app/p/${pr.project_id}/products`);
  }
  return res;
}
