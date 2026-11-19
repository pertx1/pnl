import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { salesSummary, type LineItem } from "@/lib/shopify/core";
import type { Database } from "@/lib/supabase/database.types";
import { aggregateMetrics, type MetricRow } from "./core";

/**
 * Reúne los datos de un informe. Con la sesión del usuario (RLS) para la descarga desde la app;
 * con el cliente admin SOLO en el worker de envíos programados (la programación ya la creó un editor).
 */

type Db = SupabaseClient<Database>;

export type ReportData = Awaited<ReturnType<typeof loadReportData>>;

export async function loadReportData(db: Db, projectId: string, period: { since: string; until: string }, includeSales: boolean) {
  const sinceTs = `${period.since}T00:00:00Z`;
  const untilTs = `${period.until}T23:59:59.999Z`;

  const [{ data: project }, { data: kit }, { data: accounts }, { data: metrics }, { data: targets }] = await Promise.all([
    db.from("projects").select("id, name, workspace_id").eq("id", projectId).maybeSingle(),
    db.from("brand_kits").select("logo_path, colors").eq("project_id", projectId).maybeSingle(),
    db.from("social_accounts").select("id, platform, handle, display_name").eq("project_id", projectId),
    db
      .from("account_metrics_daily")
      .select("social_account_id, day, followers, views, likes, social_accounts!inner(project_id, platform)")
      .eq("social_accounts.project_id", projectId)
      .gte("day", period.since)
      .lte("day", period.until)
      .order("day")
      .limit(5000),
    db
      .from("post_targets")
      .select("id, published_at, external_url, caption_override, social_accounts(platform, handle), posts!inner(project_id, title, caption)")
      .eq("posts.project_id", projectId)
      .eq("status", "published")
      .gte("published_at", sinceTs)
      .lte("published_at", untilTs)
      .order("published_at", { ascending: false })
      .limit(200),
  ]);
  if (!project) return null;

  const rows: MetricRow[] = (metrics ?? []).map((m) => ({
    accountId: m.social_account_id,
    platform: m.social_accounts?.platform ?? "",
    day: m.day,
    followers: m.followers,
    views: m.views,
    likes: m.likes,
  }));
  const agg = aggregateMetrics(rows, period.since, period.until);
  const accName = new Map((accounts ?? []).map((a) => [a.id, { platform: a.platform as string, name: a.handle ? `@${a.handle.replace(/^@/, "")}` : (a.display_name ?? "—") }]));

  // Métricas por publicación (último snapshot), si las hay.
  const ids = (targets ?? []).map((t) => t.id);
  const latest = new Map<string, { views: number | null; likes: number | null }>();
  if (ids.length) {
    // post_metrics aún no está en los tipos generados: consulta sin tipar con su forma conocida.
    const loose = db as unknown as SupabaseClient;
    const { data: pm } = await loose.from("post_metrics").select("post_target_id, views, likes, captured_at").in("post_target_id", ids).order("captured_at", { ascending: false }).limit(2000);
    for (const m of (pm ?? []) as { post_target_id: string; views: number | null; likes: number | null }[]) if (!latest.has(m.post_target_id)) latest.set(m.post_target_id, { views: m.views, likes: m.likes });
  }
  const posts = (targets ?? []).map((t) => {
    const m = latest.get(t.id);
    const text = (t.posts?.title || t.caption_override || t.posts?.caption || "").trim();
    return {
      id: t.id,
      text,
      platform: t.social_accounts?.platform ?? "",
      account: t.social_accounts?.handle ? `@${t.social_accounts.handle.replace(/^@/, "")}` : "",
      publishedAt: t.published_at,
      url: t.external_url,
      views: m?.views ?? null,
      likes: m?.likes ?? null,
    };
  });
  posts.sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || (b.likes ?? -1) - (a.likes ?? -1));

  let sales: ReturnType<typeof salesSummary> | null = null;
  if (includeSales) {
    const { data: store } = await db.from("shopify_stores").select("id").eq("project_id", projectId).maybeSingle();
    if (store) {
      const { data: orders } = await db
        .from("shopify_orders")
        .select("ordered_at, total, currency, cancelled, test, line_items")
        .eq("project_id", projectId)
        .gte("ordered_at", sinceTs)
        .lte("ordered_at", untilTs)
        .limit(10000);
      sales = salesSummary(
        (orders ?? []).map((o) => ({ orderedAt: o.ordered_at, total: Number(o.total), currency: o.currency, cancelled: o.cancelled, test: o.test, lineItems: (o.line_items ?? []) as LineItem[] })),
      );
    }
  }

  // Logo del brand kit (bucket privado). PNG y JPG se incrustan; otros formatos se omiten.
  let logo: { bytes: Uint8Array; type: "png" | "jpg" } | null = null;
  if (kit?.logo_path) {
    const { data: blob } = await db.storage.from("brand-assets").download(kit.logo_path);
    if (blob && blob.size <= 5 * 1024 * 1024) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes[0] === 0x89 && bytes[1] === 0x50) logo = { bytes, type: "png" };
      else if (bytes[0] === 0xff && bytes[1] === 0xd8) logo = { bytes, type: "jpg" };
    }
  }
  const colors = Array.isArray(kit?.colors) ? (kit.colors as { hex?: string }[]).map((c) => c?.hex).filter((h): h is string => typeof h === "string") : [];

  return {
    project: { id: project.id, name: project.name, workspaceId: project.workspace_id },
    period,
    brand: { logo, colors },
    kpis: agg.totals,
    hasYouTube: agg.hasYouTube,
    followersByDay: agg.followersByDay,
    accounts: agg.accounts.map((a) => ({ ...a, name: accName.get(a.accountId)?.name ?? "—" })),
    publishedCount: posts.length,
    topPosts: posts.slice(0, 8),
    sales,
  };
}
