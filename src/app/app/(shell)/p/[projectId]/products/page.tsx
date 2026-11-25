import { getTranslations } from "next-intl/server";
import { PackageSearch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isAgentsConfigured } from "@/lib/agents";
import type { ProductAnalysis } from "@/lib/agents/cazador";
import { isAdLibraryConfigured } from "@/lib/research/config";
import { RESEARCH_CREDITS } from "@/lib/research/credits";
import { EU_COUNTRIES } from "@/lib/research/parse";
import type { ScoreFactor } from "@/lib/research/score";
import { getCreditBalance, getProject, roleAtLeast } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";
import { ListsBar } from "./lists-bar";
import { ManualProductForm } from "./manual-form";
import { ProductCard, type ProductView } from "./product-card";
import { SearchPanel } from "./search-panel";

export async function generateMetadata() {
  const t = await getTranslations("products");
  return { title: t("title") };
}

export default async function ProductsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ list?: string }> }) {
  const { projectId } = await params;
  const { list } = await searchParams;
  const t = await getTranslations("products");
  const project = await getProject(projectId);
  const canEdit = roleAtLeast(project.workspace.role, "editor");
  const activeList = list && /^[0-9a-f-]{36}$/i.test(list) ? list : null;
  const supabase = await createClient();

  let productsQuery = supabase.from("research_products").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(100);
  if (activeList) productsQuery = productsQuery.eq("list_id", activeList);
  const [{ data: lists }, { data: products }, { data: allProducts }, balance] = await Promise.all([
    supabase.from("research_product_lists").select("id, name").eq("project_id", projectId).order("created_at"),
    productsQuery,
    supabase.from("research_products").select("list_id").eq("project_id", projectId),
    getCreditBalance(project.workspace_id),
  ]);
  const ids = (products ?? []).map((p) => p.id);
  const { data: analyses } = ids.length
    ? await supabase.from("research_analyses").select("subject_id, result, created_at").eq("subject_type", "product").in("subject_id", ids).order("created_at", { ascending: false })
    : { data: [] };
  const lastAnalysis = new Map<string, { result: ProductAnalysis; createdAt: string }>();
  for (const a of analyses ?? []) if (!lastAnalysis.has(a.subject_id)) lastAnalysis.set(a.subject_id, { result: a.result as unknown as ProductAnalysis, createdAt: a.created_at });

  const counts = new Map<string, number>();
  for (const p of allProducts ?? []) if (p.list_id) counts.set(p.list_id, (counts.get(p.list_id) ?? 0) + 1);
  const listItems = (lists ?? []).map((l) => ({ ...l, count: counts.get(l.id) ?? 0 }));
  const views: ProductView[] = (products ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    notes: p.notes,
    supplierUrl: p.supplier_url,
    listId: p.list_id,
    source: p.source,
    pageName: p.page_name,
    libraryUrl: p.ad_snapshot_url,
    adText: p.ad_text,
    score: p.score,
    factors: ((p.score_breakdown as { factors?: ScoreFactor[] } | null)?.factors ?? []) as ScoreFactor[],
    currency: p.currency,
    salePrice: p.sale_price === null ? null : Number(p.sale_price),
    unitCost: p.unit_cost === null ? null : Number(p.unit_cost),
    shippingCost: p.shipping_cost === null ? null : Number(p.shipping_cost),
    feePct: p.fee_pct === null ? null : Number(p.fee_pct),
    cpa: p.cpa === null ? null : Number(p.cpa),
    analysis: lastAnalysis.get(p.id) ?? null,
  }));
  const adLibrary = isAdLibraryConfigured();

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-6">
      <div>
        <h1 className="page-title">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("search.title")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("search.subtitle")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!adLibrary && (
            <div role="note" className="space-y-1 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              <p className="font-medium">{t("notConfigured.title")}</p>
              <p>{t("notConfigured.body")}</p>
            </div>
          )}
          <SearchPanel
            projectId={projectId}
            enabled={adLibrary}
            canEdit={canEdit}
            countries={EU_COUNTRIES}
            defaultCountry="ES"
            lists={(lists ?? []).map((l) => ({ id: l.id, name: l.name }))}
          />
        </CardContent>
      </Card>

      <section aria-labelledby="saved-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="saved-title" className="label-mono">
            {t("saved", { count: views.length })}
          </h2>
        </div>
        <ListsBar projectId={projectId} lists={listItems} active={activeList} canEdit={canEdit} />
        {canEdit && <ManualProductForm projectId={projectId} listId={activeList} />}
        {!isAgentsConfigured() && <p className="text-xs text-muted-foreground">{t("aiNotConfigured")}</p>}
        {views.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
            <PackageSearch className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <p className="font-medium">{t("empty.title")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("empty.body")}</p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {views.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                lists={(lists ?? []).map((l) => ({ id: l.id, name: l.name }))}
                canEdit={canEdit}
                aiEnabled={isAgentsConfigured()}
                credits={RESEARCH_CREDITS.analyzeProduct}
                balance={balance}
              />
            ))}
          </div>
        )}
      </section>
      <p className="text-xs text-muted-foreground">{t("legalNote")}</p>
    </div>
  );
}
