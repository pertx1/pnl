import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  FileText,
  Flame,
  Lightbulb,
  ListTodo,
  Map,
  PackageSearch,
  Palette,
  Plug,
  Plus,
  Scissors,
  Sparkles,
  Swords,
  TriangleAlert,
  UserCheck,
} from "lucide-react";
import { MiniBars, Sparkline } from "@/components/dashboard/sparkline";
import { EmptyState } from "@/components/kreo/empty-state";
import { IconBubble } from "@/components/kreo/icon-bubble";
import { UpcomingStrip } from "@/components/kreo/upcoming-strip";
import { WeekAhead, type WeekPost } from "@/components/dashboard/week-ahead";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requestMetricsIfStale } from "@/lib/analytics/refresh";
import { combinedTotals, creditsSpent, dashboardBounds, statsByAccount, successRate, weeklyRhythm, type AccountStats } from "@/lib/dashboard/stats";
import { getBrandKit, getCreditBalance, getProject, roleAtLeast } from "@/lib/server/dal";
import { getPostCovers } from "@/lib/server/post-media";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/app/p/[projectId]">) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  return { title: project.name };
}

const UPCOMING_STATUSES = ["draft", "pending_approval", "approved", "scheduled", "scheduled_on_platform", "awaiting_user_publish", "publishing"] as const;

/**
 * Panel del proyecto: «¿cómo van mis cuentas?», «¿qué tengo que hacer hoy?» y «¿qué viene esta semana?».
 * Todo se lee con RLS (cliente del usuario) y en paralelo. Los cálculos de fechas y agregados viven en
 * `src/lib/dashboard/stats.ts` (puros y con tests).
 */
export default async function ProjectPage({ params }: PageProps<"/app/p/[projectId]">) {
  const { projectId } = await params;
  const [t, tp, tn, ta, ts, th, format, project, supabase] = await Promise.all([
    getTranslations("projects.dashboard"),
    getTranslations("projects"),
    getTranslations("nav"),
    getTranslations("accounts"),
    getTranslations("posts.status"),
    getTranslations("home"),
    getFormatter(),
    getProject(projectId),
    createClient(),
  ]);
  const base = `/app/p/${projectId}`;
  const b = dashboardBounds();
  const canEdit = roleAtLeast(project.workspace.role, "editor");

  const [
    kit,
    credits,
    { data: accounts },
    { data: metrics },
    { count: pendingCount },
    { count: draftCount },
    { count: failed7Count },
    { data: dueTasks },
    { data: week },
    { data: published30 },
    { count: failed30Count },
    { data: ledger },
    { count: postsCount },
    { count: apiKeysCount },
    { count: oauthCount },
  ] = await Promise.all([
    getBrandKit(projectId),
    getCreditBalance(project.workspace_id),
    supabase.from("social_accounts").select("id, platform, handle, display_name, status, last_synced_at").eq("project_id", projectId).order("created_at"),
    supabase
      .from("account_metrics_daily")
      .select("social_account_id, day, followers, views, likes, social_accounts!inner(project_id)")
      .eq("social_accounts.project_id", projectId)
      .gte("day", b.metricsSinceDay)
      .order("day")
      .limit(2000),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "pending_approval"),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "draft"),
    supabase
      .from("post_targets")
      .select("id, posts!inner(project_id)", { count: "exact", head: true })
      .eq("posts.project_id", projectId)
      .eq("status", "failed")
      .gte("updated_at", b.since7Iso),
    supabase.from("roadmap_tasks").select("id, due_date").eq("project_id", projectId).neq("status", "done").lte("due_date", b.today).limit(500),
    supabase
      .from("posts")
      .select("id, title, caption, status, scheduled_at, asset_ids, ai_generated, post_targets(platform_options, social_accounts(platform))")
      .eq("project_id", projectId)
      .in("status", [...UPCOMING_STATUSES])
      .gte("scheduled_at", b.nowIso)
      .lt("scheduled_at", b.in7Iso)
      .order("scheduled_at")
      .limit(100),
    supabase
      .from("post_targets")
      .select("published_at, posts!inner(project_id)")
      .eq("posts.project_id", projectId)
      .eq("status", "published")
      .gte("published_at", b.since30Iso)
      .limit(2000),
    supabase
      .from("post_targets")
      .select("id, posts!inner(project_id)", { count: "exact", head: true })
      .eq("posts.project_id", projectId)
      .eq("status", "failed")
      .gte("updated_at", b.since30Iso),
    supabase.from("credit_ledger").select("delta, reason").eq("workspace_id", project.workspace_id).gte("created_at", b.since30Iso).limit(5000),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("project_id", projectId).neq("status", "cancelled"),
    // Kreo conectado a Claude: alguna clave de API o app OAuth activa del usuario (RLS: solo las suyas).
    supabase.from("mcp_api_keys").select("id", { count: "exact", head: true }).is("revoked_at", null),
    supabase.from("mcp_oauth_grants").select("id", { count: "exact", head: true }).is("revoked_at", null),
  ]);

  const accs = accounts ?? [];
  // Cuentas activas sin estadísticas (o con más de 6 h): se piden al momento, como en Analíticas.
  await requestMetricsIfStale(
    projectId,
    accs.filter((a) => a.status === "active"),
  );

  const stats = statsByAccount(accs, metrics ?? []);
  const totals = combinedTotals(accs, stats);
  const tasksDue = (dueTasks ?? []).length;
  const tasksOverdue = (dueTasks ?? []).filter((x) => x.due_date && x.due_date < b.today).length;
  const publishedDates = (published30 ?? []).map((x) => x.published_at).filter((x): x is string => !!x);
  const rhythm = weeklyRhythm(publishedDates, b.nowIso);
  const published = publishedDates.length;
  const failed30 = failed30Count ?? 0;
  const rate = successRate(published, failed30);
  const spent = creditsSpent(ledger ?? []);
  // Portadas de la semana firmadas en un solo lote (miniaturas de la tira y de la lista).
  const covers = await getPostCovers(supabase, week ?? []);
  const stripPosts = (week ?? []).slice(0, 12).map((p) => ({
    id: p.id,
    projectId,
    title: p.title?.trim() || p.caption.trim() || tp("noCaption"),
    status: p.status,
    aiGenerated: p.ai_generated,
    platforms: (p.post_targets ?? []).map((x) => x.social_accounts?.platform).filter((x): x is NonNullable<typeof x> => !!x),
    cover: covers.get(p.id) ?? null,
    whenIso: p.scheduled_at,
  }));
  const weekPosts: WeekPost[] = (week ?? []).map((p) => ({
    cover: covers.get(p.id) ?? null,
    id: p.id,
    title: p.title,
    caption: p.caption,
    status: p.status,
    scheduledAt: p.scheduled_at!,
    platforms: (p.post_targets ?? []).map((x) => x.social_accounts?.platform).filter((x): x is NonNullable<typeof x> => !!x),
  }));

  const n = (v: number | null) => (v === null ? "—" : format.number(v, { notation: "compact", maximumFractionDigits: 1 }));
  const signed = (v: number) => format.number(v, { notation: "compact", maximumFractionDigits: 1, signDisplay: "exceptZero" });
  const now = new Date(b.nowIso);

  const steps = [
    { icon: Plug, title: t("stepAccounts"), body: t("stepAccountsBody"), href: `${base}/accounts`, done: accs.length > 0 },
    { icon: Plus, title: t("stepFirstPost"), body: t("stepFirstPostBody"), href: `${base}/posts/new`, done: (postsCount ?? 0) > 0 },
    { icon: Palette, title: t("stepBrandKit"), body: t("stepBrandKitBody"), href: `${base}/brand-kit`, done: Boolean(kit.tone_of_voice && kit.target_audience) },
    { icon: Bot, title: t("stepClaude"), body: t("stepClaudeBody"), href: "/app/settings/api-keys", done: (apiKeysCount ?? 0) + (oauthCount ?? 0) > 0 },
  ];
  const stepsDone = steps.filter((s) => s.done).length;

  const todo: { label: string; hint: string; count: number; href: string; icon: LucideIcon; tone: "warning" | "destructive" }[] = [
    { label: t("pending"), hint: t("pendingHint", { count: pendingCount ?? 0 }), count: pendingCount ?? 0, href: `${base}/calendar?status=pending_approval`, icon: UserCheck, tone: "warning" },
    { label: t("drafts"), hint: t("draftsHint", { count: draftCount ?? 0 }), count: draftCount ?? 0, href: `${base}/calendar?status=draft`, icon: FileText, tone: "warning" },
    { label: t("failed"), hint: t("failedHint", { count: failed7Count ?? 0 }), count: failed7Count ?? 0, href: `${base}/calendar?status=failed`, icon: TriangleAlert, tone: "destructive" },
    { label: t("tasks"), hint: t("tasksHint", { count: tasksDue, overdue: tasksOverdue }), count: tasksDue, href: `${base}/strategy`, icon: ListTodo, tone: tasksOverdue ? "destructive" : "warning" },
  ];
  const allClear = todo.every((x) => x.count === 0);

  const tools = [
    { href: `${base}/studio`, icon: Sparkles, label: tn("studio") },
    { href: `${base}/clipper`, icon: Scissors, label: tn("clipper") },
    { href: `${base}/inspiration`, icon: Lightbulb, label: tn("inspiration") },
    { href: `${base}/analytics`, icon: BarChart3, label: tn("analytics") },
    { href: `${base}/competitors`, icon: Swords, label: tn("competitors") },
    { href: `${base}/products`, icon: PackageSearch, label: tn("products") },
    { href: `${base}/strategy`, icon: Map, label: tn("strategy") },
    { href: `${base}/warmup`, icon: Flame, label: tn("warmup") },
  ];

  /** Texto accesible del sparkline: de dónde a dónde ha ido la serie. */
  const sparkText = (label: string, s: AccountStats) => {
    const first = s.series[0]?.value;
    const last = s.series.at(-1)?.value;
    if (first === undefined || last === undefined) return label;
    return first === last ? t("sparkLabelFlat", { label, value: n(last) }) : t("sparkLabel", { label, from: n(first), to: n(last) });
  };
  const delta = (value: number | undefined, text: (v: string) => string) =>
    value === undefined ? null : (
      <span className={cn("font-mono text-xs tabular-nums", value > 0 ? "text-success" : value < 0 ? "text-destructive" : "text-muted-foreground")}>
        {text(signed(value))}
      </span>
    );

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-6 sm:space-y-8">
      {/* Cabecera */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="page-title">{project.name}</h1>
          {project.description && <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>}
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="lg">
              <Link href={`${base}/studio`}>
                <Sparkles /> {tp("generate")}
              </Link>
            </Button>
            <Button asChild size="lg">
              <Link href={`${base}/posts/new`}>
                <Plus /> {tp("newPost")}
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Primeros pasos: desaparecen al completarse todos */}
      {stepsDone < steps.length && (
        <section aria-labelledby="steps-title" className="surface rounded-xl border p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="steps-title" className="section-title">
              {t("stepsTitle")}
            </h2>
            <p className="font-mono text-xs text-muted-foreground tabular-nums">{t("stepsProgress", { done: stepsDone, total: steps.length })}</p>
          </div>
          <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {steps.map((s) => (
              <li key={s.title}>
                <Link
                  href={s.href}
                  className={cn("lift flex h-full items-start gap-3 rounded-2xl border p-3 hover:bg-accent/40", s.done && "border-dashed")}
                >
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", s.done ? "bg-success/12 text-success" : "bg-primary/15 text-primary-ink")}>
                    {s.done ? <Check className="size-5" aria-label={tp("done")} /> : <s.icon className="size-5" strokeWidth={1.75} aria-hidden />}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-medium", s.done && "text-muted-foreground line-through decoration-border-strong")}>{s.title}</span>
                    <span className="block text-xs text-muted-foreground">{s.body}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Próximas publicaciones: tarjetas 9:16 con la miniatura del medio */}
      <UpcomingStrip
        id="upcoming-title"
        title={th("upcomingTitle")}
        posts={stripPosts}
        statusLabel={(st) => ts(st)}
        aiLabel={th("aiLabel")}
        moreHref={`${base}/calendar`}
        moreLabel={tp("viewCalendar")}
        newHref={canEdit ? `${base}/posts/new` : undefined}
        newLabel={tp("newPost")}
        emptyText={t("weekEmpty")}
      />

      {/* Hoy */}
      <section aria-labelledby="today-title" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="today-title" className="section-title">
            {t("todayTitle")}
          </h2>
          <p className="text-xs text-muted-foreground">{allClear ? t("allClear") : t("todayIntro")}</p>
        </div>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {todo.map((x) => (
            <li key={x.label}>
              <Link
                href={x.href}
                aria-label={`${t("open", { label: x.label })}: ${x.count}. ${x.hint}`}
                className="surface lift group flex h-full flex-col gap-1 rounded-xl border p-4"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{x.label}</span>
                  <IconBubble icon={x.icon} size="sm" tone={x.count ? x.tone : "neutral"} />
                </span>
                <span className="flex items-baseline gap-2">
                  <span className={cn("font-mono text-3xl font-semibold tabular-nums", !x.count && "text-muted-foreground")}>{x.count}</span>
                  <ArrowRight className="size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none" aria-hidden />
                </span>
                <span className="text-xs text-muted-foreground">{x.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Cuentas */}
      <section aria-labelledby="accounts-title" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="accounts-title" className="section-title">
            {t("accountsTitle")}
          </h2>
          {accs.length > 0 && (
            <Link href={`${base}/accounts`} className="link inline-flex min-h-11 items-center text-sm sm:min-h-0">
              {t("accountsManage")}
            </Link>
          )}
        </div>

        {accs.length === 0 ? (
          <EmptyState icon={Plug} tone="info" body={t("accountsEmpty")}>
            <span className="flex w-full justify-center gap-2" aria-hidden>
              <PlatformIcon platform="tiktok" className="size-10 rounded-xl" />
              <PlatformIcon platform="instagram" className="size-10 rounded-xl" />
              <PlatformIcon platform="youtube" className="size-10 rounded-xl" />
            </span>
            <Button asChild size="lg">
              <Link href={`${base}/accounts`}>
                <Plug /> {t("connectAccounts")}
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <>
            {totals.accounts >= 2 && totals.followers !== null && (
              <div className="surface flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex -space-x-1.5" aria-hidden>
                    <PlatformIcon platform="tiktok" className="size-6 ring-2 ring-card" />
                    <PlatformIcon platform="instagram" className="size-6 ring-2 ring-card" />
                  </span>
                  <span className="text-sm font-medium">{t("combinedTitle")}</span>
                </div>
                <dl className="flex flex-wrap gap-x-8 gap-y-2">
                  <div>
                    <dt className="label-mono">{t("followers")}</dt>
                    <dd className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-mono text-xl font-semibold tabular-nums">{n(totals.followers)}</span>
                      {delta(totals.delta7, (v) => t("change7", { value: v }))}
                    </dd>
                  </div>
                  <div>
                    <dt className="label-mono">{t("views")}</dt>
                    <dd className="font-mono text-xl font-semibold tabular-nums">{n(totals.views)}</dd>
                  </div>
                  <div>
                    <dt className="label-mono">{t("likes")}</dt>
                    <dd className="font-mono text-xl font-semibold tabular-nums">{n(totals.likes)}</dd>
                  </div>
                </dl>
                <p className="w-full text-xs text-muted-foreground">{t("combinedNote")}</p>
              </div>
            )}

            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {accs.map((a) => {
                const s = stats.get(a.id)!;
                const isYouTube = a.platform === "youtube";
                const broken = a.status !== "active";
                const followersLabel = isYouTube ? t("subscribers") : t("followers");
                const handle = a.handle ? `@${a.handle.replace(/^@/, "")}` : (a.display_name ?? ta(`platformNames.${a.platform}`));
                return (
                  <li key={a.id}>
                    <article className={cn("surface flex h-full flex-col rounded-xl border", broken && "border-warning/50")} aria-label={`${ta(`platformNames.${a.platform}`)} ${handle}`}>
                      <header className="flex items-center gap-3 p-4 pb-0">
                        <PlatformIcon platform={a.platform} label className="size-9" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{handle}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {a.display_name && a.handle ? `${a.display_name} · ` : ""}
                            {ta(`platformNames.${a.platform}`)}
                          </p>
                        </div>
                        {broken && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-warning/10 px-1.5 py-0.5 text-xs font-semibold text-warning">
                            <AlertTriangle className="size-3" aria-hidden /> {ta(`status.${a.status}`)}
                          </span>
                        )}
                      </header>

                      <div className="flex-1 p-4">
                        {!s.hasData ? (
                          broken ? null : (
                            <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground" role="status">
                              <span aria-hidden className="inline-block h-3.5 w-2 animate-pulse bg-primary-ink motion-reduce:animate-none" />
                              {t("loadingStats")}
                            </p>
                          )
                        ) : (
                          <>
                            <div className="flex items-end justify-between gap-4">
                              <div className="min-w-0">
                                <p className="label-mono">{followersLabel}</p>
                                <p className="font-mono text-3xl font-semibold tabular-nums">{n(s.followers)}</p>
                              </div>
                              {/* YouTube sin línea de evolución: sería una variación (métrica derivada) de sus datos. */}
                              {!isYouTube && s.series.length >= 2 && (
                                <Sparkline values={s.series.map((p) => p.value)} label={sparkText(followersLabel, s)} className="max-w-32 text-muted-foreground" />
                              )}
                            </div>
                            {/* YouTube: cifras tal cual las da su API, sin métricas derivadas (Developer Policies III.E.4.h). */}
                            {isYouTube ? (
                              <p className="mt-1 text-xs text-muted-foreground">{t("youtubeAsIs")}</p>
                            ) : s.delta7 === undefined && s.delta30 === undefined ? (
                              <p className="mt-1 text-xs text-muted-foreground">{t("noHistory")}</p>
                            ) : (
                              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                                {delta(s.delta7, (v) => t("change7", { value: v }))}
                                {delta(s.delta30, (v) => t("change30", { value: v }))}
                              </p>
                            )}
                            <dl className="mt-3 grid grid-cols-2 gap-3 border-t pt-3">
                              <div>
                                <dt className="label-mono">{t("views")}</dt>
                                <dd className="font-mono text-base font-semibold tabular-nums">{n(s.views)}</dd>
                              </div>
                              <div>
                                <dt className="label-mono">{t("likes")}</dt>
                                <dd className="font-mono text-base font-semibold tabular-nums">{n(s.likes)}</dd>
                              </div>
                            </dl>
                          </>
                        )}
                        {broken && <p className="pt-2 text-sm text-warning">{t("needsReconnect")}</p>}
                      </div>

                      <footer className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
                        <span>
                          {a.last_synced_at ? (
                            <time dateTime={a.last_synced_at}>{t("updated", { time: format.relativeTime(new Date(a.last_synced_at), now) })}</time>
                          ) : (
                            t("neverSynced")
                          )}
                        </span>
                        {broken && (
                          <Link href={`${base}/accounts`} className="link inline-flex min-h-11 items-center text-sm sm:min-h-0">
                            {t("reconnect")}
                          </Link>
                        )}
                      </footer>
                    </article>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* Semana + rendimiento y créditos */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>
              <h2>{t("weekTitle")}</h2>
            </CardTitle>
            <Link href={`${base}/calendar`} className="link inline-flex min-h-11 items-center text-sm sm:min-h-0">
              {tp("viewCalendar")}
            </Link>
          </CardHeader>
          <CardContent>
            <WeekAhead posts={weekPosts} nowIso={b.nowIso} base={base} canCreate={canEdit} />
          </CardContent>
        </Card>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>
                <h2>{t("perfTitle")}</h2>
              </CardTitle>
              <Link href={`${base}/analytics`} className="link inline-flex min-h-11 items-center text-sm sm:min-h-0">
                {t("seeAnalytics")}
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-3 gap-3">
                <div>
                  <dt className="label-mono">{t("published")}</dt>
                  <dd className="font-mono text-2xl font-semibold tabular-nums">{published}</dd>
                </div>
                <div>
                  <dt className="label-mono">{t("failedShort")}</dt>
                  <dd className={cn("font-mono text-2xl font-semibold tabular-nums", failed30 > 0 && "text-destructive")}>{failed30}</dd>
                </div>
                <div>
                  <dt className="label-mono">{t("successRate")}</dt>
                  <dd className="font-mono text-2xl font-semibold tabular-nums">{rate === null ? "—" : `${rate} %`}</dd>
                </div>
              </dl>
              {published + failed30 === 0 ? (
                <p className="text-sm text-muted-foreground">{t("perfEmpty")}</p>
              ) : (
                <div className="flex items-end gap-4">
                  <div className="shrink-0">
                    <p className="label-mono">{t("perWeek")}</p>
                    <p className="font-mono text-lg font-semibold tabular-nums">{format.number(rhythm.perWeek, { maximumFractionDigits: 1 })}</p>
                  </div>
                  <MiniBars values={rhythm.buckets} label={t("perfBars", { values: rhythm.buckets.join(", ") })} className="flex-1" />
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t("perfNote")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("creditsTitle")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="label-mono">{t("creditsBalance")}</dt>
                  <dd className="font-mono text-2xl font-semibold tabular-nums">{format.number(credits)}</dd>
                </div>
                <div>
                  <dt className="label-mono">{t("creditsSpent")}</dt>
                  <dd className="font-mono text-2xl font-semibold tabular-nums">{format.number(spent)}</dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">{t("creditsNote")}</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={`${base}/studio`}>
                    <Sparkles /> {t("openStudio")}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/app/billing">{t("buyCredits")}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Herramientas: acceso compacto y secundario */}
      <nav aria-labelledby="tools-title" className="space-y-3">
        <h2 id="tools-title" className="section-title">
          {t("toolsTitle")}
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {tools.map((tool) => (
            <li key={tool.href}>
              <Link
                href={tool.href}
                className="lift flex min-h-11 items-center gap-2.5 rounded-2xl border bg-card p-2 text-sm font-medium xl:flex-col xl:items-start xl:p-3"
              >
                <IconBubble icon={tool.icon} size="sm" />
                <span className="min-w-0 truncate">{tool.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
