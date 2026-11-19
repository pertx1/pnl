import { getFormatter, getTranslations } from "next-intl/server";
import { Eye, Link2, Package, Receipt, ShieldCheck, ShoppingBag, Store, TicketPercent, TrendingUp, Users, Wallet } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { StatCard } from "@/components/kreo/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { aggregateMetrics, lastDays } from "@/lib/reports/core";
import { getProject, roleAtLeast } from "@/lib/server/dal";
import { isShopifyConfigured } from "@/lib/shopify/client";
import { attributeOrders, salesSummary, SHOPIFY_SCOPES, type LineItem } from "@/lib/shopify/core";
import { createClient } from "@/lib/supabase/server";
import { AttributionForms, DeleteAttributionButton, StoreActions } from "./shopify-client";

export async function generateMetadata() {
  const t = await getTranslations("commerce.shopify");
  return { title: t("title") };
}

const PERIODS = [7, 30, 60] as const;
const KNOWN_ERRORS = ["not_configured", "invalid_shop", "invalid_state", "denied", "forbidden", "already_linked", "project_has_store", "token_exchange_failed", "unavailable", "rate_limited"];

export default async function ShopifyPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const t = await getTranslations("commerce.shopify");
  const format = await getFormatter();
  const project = await getProject(projectId);
  const canEdit = roleAtLeast(project.workspace.role, "editor");
  const isAdmin = roleAtLeast(project.workspace.role, "admin");
  const configured = isShopifyConfigured();
  const days = PERIODS.includes(Number(sp.days) as (typeof PERIODS)[number]) ? (Number(sp.days) as (typeof PERIODS)[number]) : 30;
  const errorKey = typeof sp.error === "string" ? sp.error : null;

  const supabase = await createClient();
  const { data: store } = await supabase.from("shopify_stores").select("id, shop_domain, shop_name, currency, status, granted_scopes, last_synced_at, sync_error").eq("project_id", projectId).maybeSingle();

  const header = (
    <div>
      <p className="label-mono">{project.name}</p>
      <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
    </div>
  );
  const alerts = (
    <>
      {errorKey && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {KNOWN_ERRORS.includes(errorKey) ? t(`errors.${errorKey}`) : t("errors.default")}
        </p>
      )}
      {sp.connected === "1" && (
        <p role="status" className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          {t("connectedOk")} {sp.missing === "1" ? t("missingScopes") : ""}
        </p>
      )}
    </>
  );

  // ------------------------------------------------------------------ Sin tienda vinculada
  if (!store) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {header}
        {alerts}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-md border bg-secondary">
                <ShoppingBag className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <div>
                <CardTitle>{t("connectTitle")}</CardTitle>
                <CardDescription>{t("connectBody")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!configured ? (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">{t("notConfigured")}</p>
            ) : !canEdit ? (
              <p className="text-sm text-muted-foreground">{t("viewerCannotConnect")}</p>
            ) : (
              <form action="/api/shopify/install" method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <input type="hidden" name="project" value={projectId} />
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="shop">{t("shopDomain")}</Label>
                  <Input id="shop" name="shop" required placeholder="mi-tienda.myshopify.com" autoComplete="off" spellCheck={false} pattern="[A-Za-z0-9][A-Za-z0-9\-]*(\.myshopify\.com)?" aria-describedby="shop-hint" />
                  <p id="shop-hint" className="text-xs text-muted-foreground">
                    {t("shopDomainHint")}
                  </p>
                </div>
                <Button type="submit">{t("connect")}</Button>
              </form>
            )}
            <div className="rounded-md border bg-secondary/40 p-3 text-xs text-muted-foreground">
              <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                <ShieldCheck className="size-4" strokeWidth={1.5} aria-hidden /> {t("privacyTitle")}
              </p>
              <p>{t("privacyBody", { scopes: SHOPIFY_SCOPES.join(", ") })}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ------------------------------------------------------------------ Tienda vinculada
  const period = lastDays(days, new Date());
  const sinceTs = `${period.since}T00:00:00Z`;
  const [{ data: orders }, { data: rules }, { data: posts }, { data: metrics }, { count: publishedCount }] = await Promise.all([
    supabase.from("shopify_orders").select("ordered_at, total, currency, cancelled, test, line_items, discount_codes, utm_campaign").eq("project_id", projectId).gte("ordered_at", sinceTs).order("ordered_at").limit(10000),
    supabase.from("commerce_attributions").select("id, kind, label, url, discount_code, discount_percent, utm_campaign, post_id, creator_label, created_at").eq("project_id", projectId).order("created_at", { ascending: false }),
    supabase.from("posts").select("id, title, caption, status, scheduled_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(50),
    supabase
      .from("account_metrics_daily")
      .select("social_account_id, day, followers, views, likes, social_accounts!inner(project_id, platform)")
      .eq("social_accounts.project_id", projectId)
      .gte("day", period.since)
      .limit(5000),
    supabase.from("post_targets").select("id, posts!inner(project_id)", { count: "exact", head: true }).eq("posts.project_id", projectId).eq("status", "published").gte("published_at", sinceTs),
  ]);

  const sales = salesSummary((orders ?? []).map((o) => ({ orderedAt: o.ordered_at, total: Number(o.total), currency: o.currency, cancelled: o.cancelled, test: o.test, lineItems: (o.line_items ?? []) as LineItem[] })));
  const attributed = attributeOrders(
    (rules ?? []).map((r) => ({ id: r.id, kind: r.kind, utmCampaign: r.utm_campaign, discountCode: r.discount_code })),
    (orders ?? []).map((o) => ({ total: Number(o.total), currency: o.currency, discountCodes: o.discount_codes, utmCampaign: o.utm_campaign, cancelled: o.cancelled, test: o.test })),
  );
  const content = aggregateMetrics(
    (metrics ?? []).map((m) => ({ accountId: m.social_account_id, platform: m.social_accounts?.platform ?? "", day: m.day, followers: m.followers, views: m.views, likes: m.likes })),
    period.since,
    period.until,
  );
  // Ventas atribuidas (sin doble conteo): pedidos que usan algún código o UTM de Kreo.
  const ruleCodes = new Set((rules ?? []).filter((r) => r.discount_code).map((r) => r.discount_code!));
  const ruleCampaigns = new Set((rules ?? []).filter((r) => r.utm_campaign).map((r) => r.utm_campaign!));
  const attributedRevenue = (orders ?? [])
    .filter((o) => !o.test && !o.cancelled && o.currency === sales.currency && (o.discount_codes.some((c) => ruleCodes.has(c)) || (o.utm_campaign && ruleCampaigns.has(o.utm_campaign))))
    .reduce((s, o) => s + Number(o.total), 0);

  const cur = sales.currency ?? store.currency ?? "EUR";
  const money = (v: number) => format.number(v, { style: "currency", currency: cur, maximumFractionDigits: 2 });
  const n = (v: number | null) => (v === null ? "—" : format.number(v, { notation: "compact", maximumFractionDigits: 1 }));
  const postOptions = (posts ?? []).map((p) => ({ id: p.id, label: (p.title || p.caption || "").trim().slice(0, 70) || t("untitledPost") }));
  const shopUrl = `https://${store.shop_domain}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {header}
        <nav aria-label={t("period")} className="flex gap-1 rounded-full border p-1">
          {PERIODS.map((d) => (
            <a
              key={d}
              href={`?days=${d}`}
              aria-current={d === days ? "page" : undefined}
              className={`rounded-full px-3 py-1 font-mono text-xs tabular-nums ${d === days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t("days", { days: d })}
            </a>
          ))}
        </nav>
      </div>
      {alerts}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4">
          <span className="grid size-10 place-items-center rounded-md border bg-secondary">
            <Store className="size-5" strokeWidth={1.5} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{store.shop_name ?? store.shop_domain}</div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{store.shop_domain}</span>
              <span>·</span>
              <span>{store.last_synced_at ? t("lastSync", { when: format.relativeTime(new Date(store.last_synced_at)) }) : t("neverSynced")}</span>
              {store.status !== "active" && <span className="rounded-sm bg-warning/15 px-1.5 py-0.5 font-semibold text-warning">{t(`status.${store.status}`)}</span>}
              {store.sync_error && store.status === "active" && <span className="text-warning">{t("syncError")}</span>}
            </div>
          </div>
          <StoreActions projectId={projectId} canEdit={canEdit && store.status === "active"} isAdmin={isAdmin} reconnectHref={canEdit && configured ? `/api/shopify/install?project=${projectId}&shop=${store.shop_domain}` : null} needsReconnect={store.status !== "active" || store.sync_error === "reauthorize"} />
        </CardContent>
      </Card>

      <section aria-labelledby="sales-h" className="space-y-3">
        <h2 id="sales-h" className="label-mono">
          {t("salesAndContent", { days })}
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t("revenue")} value={money(sales.revenue)} trend="flat" icon={Wallet} />
          <StatCard label={t("orders")} value={String(sales.orders)} trend="flat" icon={Receipt} />
          <StatCard label={t("aov")} value={money(sales.aov)} trend="flat" icon={TrendingUp} />
          <StatCard label={t("attributedRevenue")} value={money(Math.round(attributedRevenue * 100) / 100)} trend="flat" icon={TicketPercent} />
          <StatCard label={t("followers")} value={n(content.totals.followers)} delta={content.totals.growth !== null ? `${content.totals.growth >= 0 ? "+" : ""}${format.number(content.totals.growth)}` : undefined} trend={content.totals.growth === null ? "flat" : content.totals.growth >= 0 ? "up" : "down"} icon={Users} />
          <StatCard label={t("views")} value={n(content.totals.views)} trend="flat" icon={Eye} />
          <StatCard label={t("published")} value={String(publishedCount ?? 0)} trend="flat" icon={Package} />
          <StatCard label={t("conversion")} value={publishedCount ? format.number(sales.orders / publishedCount, { maximumFractionDigits: 1 }) : "—"} trend="flat" icon={ShoppingBag} />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("salesNote")} {content.hasYouTube ? t("youtubeNote") : ""} {sales.otherCurrencies ? t("multiCurrency", { currency: cur }) : ""}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t("revenueByDay")}</CardTitle>
          </CardHeader>
          <CardContent>
            {sales.byDay.length >= 2 ? (
              <AreaChart label={t("revenueByDay")} points={sales.byDay} />
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <Receipt className="size-6" strokeWidth={1.5} aria-hidden />
                {t("noOrders")}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("topProducts")}</CardTitle>
          </CardHeader>
          <CardContent>
            {sales.topProducts.length ? (
              <ol className="divide-y text-sm">
                {sales.topProducts.slice(0, 6).map((p, i) => (
                  <li key={`${p.title}-${i}`} className="flex items-center gap-3 py-2">
                    <span className="w-5 font-mono text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{p.title}</span>
                    <span className="font-mono text-xs tabular-nums">{t("units", { count: p.quantity })}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("noProducts")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Link2 className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <CardTitle>{t("attribution")}</CardTitle>
          </div>
          <CardDescription>{t("attributionBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {canEdit && store.status === "active" ? <AttributionForms projectId={projectId} posts={postOptions} defaultDestination={shopUrl} /> : !canEdit ? <p className="text-sm text-muted-foreground">{t("viewerAttribution")}</p> : null}

          {(rules ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              <TicketPercent className="size-6" strokeWidth={1.5} aria-hidden />
              {t("noRules")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("attributionTable")}</caption>
                <thead>
                  <tr className="text-left">
                    <th scope="col" className="label-mono py-2 pr-4 font-normal">{t("colTarget")}</th>
                    <th scope="col" className="label-mono py-2 pr-4 font-normal">{t("colType")}</th>
                    <th scope="col" className="label-mono py-2 pr-4 text-right font-normal">{t("orders")}</th>
                    <th scope="col" className="label-mono py-2 pr-4 text-right font-normal">{t("revenue")}</th>
                    <th scope="col" className="py-2"><span className="sr-only">{t("actions")}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(rules ?? []).map((r) => {
                    const a = attributed.get(r.id);
                    const rev = a?.revenue[cur] ?? 0;
                    return (
                      <tr key={r.id} className="align-top">
                        <td className="max-w-[320px] py-2 pr-4">
                          <div className="truncate">{r.label}</div>
                          {r.kind === "utm" ? (
                            <a href={r.url!} target="_blank" rel="noreferrer" className="block truncate font-mono text-xs text-primary-ink hover:underline">
                              {r.url}
                            </a>
                          ) : (
                            <span className="font-mono text-xs text-muted-foreground">
                              {r.discount_code} · −{format.number(Number(r.discount_percent))} %
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">{r.kind === "utm" ? t("typeUtm") : t("typeDiscount")}</td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums">{a?.orders ?? 0}</td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums">{money(rev)}</td>
                        <td className="py-2 text-right">{canEdit && <DeleteAttributionButton projectId={projectId} id={r.id} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">{t("attributionNote")}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
