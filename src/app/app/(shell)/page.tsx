import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowRight, CalendarDays, CalendarPlus, Clock, Coins, FolderPlus, LayoutDashboard, ListTodo, Plug, Plus, Send, TriangleAlert, UserCheck } from "lucide-react";
import { KIND_STYLE } from "@/components/agenda/kinds";
import { ProjectAvatar, ProjectDot } from "@/components/dashboard/project-dot";
import { QuickCreatePost } from "@/components/dashboard/quick-create";
import { Sparkline } from "@/components/dashboard/sparkline";
import { EmptyState } from "@/components/kreo/empty-state";
import { IconBubble } from "@/components/kreo/icon-bubble";
import { PostThumb } from "@/components/kreo/post-thumb";
import { StatusBadge, type PostStatus } from "@/components/kreo/status-badge";
import { UpcomingStrip } from "@/components/kreo/upcoming-strip";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_DAY, expandBlocks, freeSlotsForDay, hhmm, splitMinutes, type Occurrence } from "@/lib/agenda/core";
import { loadAgenda } from "@/lib/agenda/server";
import { requestMetricsIfStale } from "@/lib/analytics/refresh";
import { breakdown, countByProject, firstByProject, homeBounds, tasksDue } from "@/lib/dashboard/home";
import { addDaysToKey, creditsSpent, dayIn, statsByAccount } from "@/lib/dashboard/stats";
import { zonedParts } from "@/lib/mcp/calendar";
import { getCreditBalance, getCurrentWorkspace, getPlan, getProjects, requireUser, roleAtLeast } from "@/lib/server/dal";
import { getPostCovers } from "@/lib/server/post-media";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const t = await getTranslations("home");
  return { title: t("metaTitle") };
}

const NEXT_STATUSES = ["pending_approval", "approved", "scheduled", "publishing"] as const;
const STRIP_STATUSES = [...NEXT_STATUSES, "scheduled_on_platform", "awaiting_user_publish"] as const;

/**
 * Inicio: el panel general de TODOS los proyectos del workspace activo y la agenda personal del usuario.
 * «Hoy» (agenda + lo que toca en Kreo), una tarjeta por proyecto, la semana y los créditos.
 * Todo con RLS y en paralelo; los agregados viven en src/lib/dashboard/home.ts y src/lib/agenda/core.ts (puros, con tests).
 * YouTube nunca se suma ni se compara con otras redes (Developer Policies III.E.2 / III.E.4.h).
 */
export default async function HomePage() {
  const [t, tp, ts, ta, format, user, workspace, supabase] = await Promise.all([
    getTranslations("home"),
    getTranslations("projects"),
    getTranslations("posts.status"),
    getTranslations("agenda"),
    getFormatter(),
    requireUser(),
    getCurrentWorkspace(),
    createClient(),
  ]);
  const b = homeBounds();
  const ws = workspace.id;
  const canEdit = roleAtLeast(workspace.role, "editor");

  const [
    projects,
    credits,
    plan,
    agenda,
    { data: accounts },
    { data: metrics },
    { data: weekPosts },
    { data: upcoming },
    { data: pendingRows },
    { data: failedRows },
    { data: taskRows },
    { data: ledger },
    { data: stripData },
  ] = await Promise.all([
    getProjects(ws),
    getCreditBalance(ws),
    getPlan(workspace.planId),
    loadAgenda(supabase, { userId: user.id, from: b.today, to: b.weekLastDay }),
    supabase.from("social_accounts").select("id, project_id, platform, handle, display_name, status, last_synced_at").eq("workspace_id", ws).order("created_at"),
    supabase
      .from("account_metrics_daily")
      .select("social_account_id, day, followers, views, likes, social_accounts!inner(workspace_id)")
      .eq("social_accounts.workspace_id", ws)
      .gte("day", b.metricsSinceDay)
      .order("day")
      .limit(5000),
    supabase
      .from("posts")
      .select("id, project_id, title, caption, status, scheduled_at, asset_ids, post_targets(platform_options, social_accounts(platform))")
      .eq("workspace_id", ws)
      .neq("status", "cancelled")
      .gte("scheduled_at", b.todayStartIso)
      .lt("scheduled_at", b.weekEndIso)
      .order("scheduled_at")
      .limit(300),
    supabase
      .from("posts")
      .select("id, project_id, title, caption, status, scheduled_at")
      .eq("workspace_id", ws)
      .in("status", [...NEXT_STATUSES])
      .gte("scheduled_at", b.nowIso)
      .order("scheduled_at")
      .limit(300),
    supabase.from("posts").select("project_id").eq("workspace_id", ws).eq("status", "pending_approval").limit(1000),
    supabase
      .from("post_targets")
      .select("id, posts!inner(project_id, workspace_id)")
      .eq("posts.workspace_id", ws)
      .eq("status", "failed")
      .gte("updated_at", b.since7Iso)
      .limit(1000),
    supabase.from("roadmap_tasks").select("project_id, due_date").eq("workspace_id", ws).neq("status", "done").lte("due_date", b.today).limit(1000),
    supabase.from("credit_ledger").select("delta, reason").eq("workspace_id", ws).gte("created_at", b.since30Iso).limit(5000),
    // Tira «Próximas publicaciones»: también los borradores con fecha (como el panel del proyecto).
    supabase
      .from("posts")
      .select("id, project_id, title, caption, status, scheduled_at, asset_ids, ai_generated, post_targets(platform_options, social_accounts(platform))")
      .eq("workspace_id", ws)
      .in("status", ["draft", ...STRIP_STATUSES])
      .gte("scheduled_at", b.nowIso)
      .order("scheduled_at")
      .limit(12),
  ]);

  const accs = accounts ?? [];
  // Estadísticas al momento si están viejas (Inngest deduplica por proyecto y cuarto de hora).
  const activeByProject = new Map<string, typeof accs>();
  for (const a of accs) if (a.status === "active") activeByProject.set(a.project_id, [...(activeByProject.get(a.project_id) ?? []), a]);
  await Promise.all([...activeByProject.entries()].map(([pid, list]) => requestMetricsIfStale(pid, list)));

  const stats = statsByAccount(accs, metrics ?? []);
  // Portadas de las publicaciones (próximas + de hoy) firmadas en un solo lote.
  const stripRows = stripData ?? [];
  const covers = await getPostCovers(supabase, [...stripRows, ...(weekPosts ?? [])]);
  const nameOf = new Map(projects.map((p) => [p.id, p.name]));
  const posts = (weekPosts ?? []).map((p) => ({
    ...p,
    day: dayIn(new Date(p.scheduled_at!), DEFAULT_DAY.timezone),
    time: zonedParts(new Date(p.scheduled_at!), DEFAULT_DAY.timezone).time,
    label: p.title?.trim() || p.caption.trim() || tp("noCaption"),
    platforms: [...new Set((p.post_targets ?? []).map((x) => x.social_accounts?.platform).filter((x): x is NonNullable<typeof x> => !!x))],
  }));
  const todayPosts = posts.filter((p) => p.day === b.today);
  const nextPost = firstByProject(upcoming ?? []);
  const pendingCounts = countByProject(pendingRows ?? [], (r) => r.project_id);
  const failedCounts = countByProject(failedRows ?? [], (r) => r.posts?.project_id);
  const tasks = tasksDue(taskRows ?? [], b.today);
  const spent = creditsSpent(ledger ?? []);

  // Agenda: hoy y los próximos 6 días.
  const occ = expandBlocks(agenda.blocks, b.today, b.weekLastDay);
  const occToday = occ.filter((o) => o.day === b.today);
  const freeToday = freeSlotsForDay({
    day: b.today,
    settings: agenda.settings,
    busy: occToday.map((o) => ({ start: Date.parse(o.start), end: Date.parse(o.end) })),
    nowMs: b.nowMs,
  });

  const dur = (min: number) => {
    const { h, m } = splitMinutes(min);
    return h && m ? ta("durationHm", { h, m }) : h ? ta("durationH", { h }) : ta("durationM", { m });
  };
  const n = (v: number | null) => (v === null ? "—" : format.number(v, { notation: "compact", maximumFractionDigits: 1 }));
  const signed = (v: number) => format.number(v, { notation: "compact", maximumFractionDigits: 1, signDisplay: "exceptZero" });
  const dayDate = (day: string) => new Date(`${day}T12:00:00Z`);
  const todayLabel = format.dateTime(dayDate(b.today), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  type Tile = { key: string; label: string; icon: LucideIcon; tone: "neutral" | "warning" | "destructive"; total: number; rows: { id: string; name: string; index: number; count: number }[]; href: (pid: string) => string; totalHref: string | null; hint: string };
  const todayCounts = countByProject(todayPosts, (p) => p.project_id);
  const tiles: Tile[] = [
    { key: "today", label: t("tilePostsToday"), icon: Send, tone: "neutral", ...breakdown(projects, todayCounts), href: (pid) => `/app/p/${pid}/calendar?view=week&d=${b.today}`, totalHref: `/app/calendar?view=week&d=${b.today}`, hint: t("tilePostsTodayHint") },
    { key: "pending", label: t("tilePending"), icon: UserCheck, tone: "warning", ...breakdown(projects, pendingCounts), href: (pid) => `/app/p/${pid}/calendar?status=pending_approval`, totalHref: null, hint: t("tilePendingHint") },
    { key: "failed", label: t("tileFailed"), icon: TriangleAlert, tone: "destructive", ...breakdown(projects, failedCounts), href: (pid) => `/app/p/${pid}/calendar?status=failed`, totalHref: null, hint: t("tileFailedHint") },
    {
      key: "tasks",
      label: t("tileTasks"),
      icon: ListTodo,
      tone: tasks.overdue ? "destructive" : "warning",
      ...breakdown(projects, countByProject(tasks.due, (r) => r.project_id)),
      href: (pid) => `/app/p/${pid}/strategy`,
      totalHref: null,
      hint: tasks.overdue ? t("tileTasksOverdue", { count: tasks.overdue }) : t("tileTasksHint"),
    },
  ];
  for (const tile of tiles) if (!tile.totalHref && tile.rows.length === 1) tile.totalHref = tile.href(tile.rows[0].id);
  const kreoTodo = tiles.slice(1).reduce((a, x) => a + x.total, 0);

  const stripPosts = stripRows.map((p) => ({
    id: p.id,
    projectId: p.project_id,
    title: p.title?.trim() || p.caption.trim() || tp("noCaption"),
    status: p.status,
    aiGenerated: p.ai_generated,
    platforms: (p.post_targets ?? []).map((x) => x.social_accounts?.platform).filter((x): x is NonNullable<typeof x> => !!x),
    cover: covers.get(p.id) ?? null,
    whenIso: p.scheduled_at,
    projectName: projects.length > 1 ? nameOf.get(p.project_id) : undefined,
  }));

  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysToKey(b.today, i));
  const projectChoices = canEdit ? projects.map((p) => ({ id: p.id, name: p.name })) : [];

  const occItem = (o: Occurrence, compact = false) => {
    const S = KIND_STYLE[o.kind];
    return (
      <span className={cn("flex min-w-0 items-center gap-2 rounded-md py-1 pr-2 text-sm", S.tint)}>
        <span aria-hidden className={cn("w-1 self-stretch rounded-l-md", S.bar)} />
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {hhmm(o.startMinute)}
          {compact ? "" : `–${hhmm(o.endMinute)}`}
        </span>
        <span className="min-w-0 truncate">{o.title}</span>
        <span className="sr-only">· {ta(`kinds.${o.kind}`)}</span>
      </span>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-6 sm:space-y-8">
      {/* Cabecera */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{workspace.name}</p>
          <h1 className="page-title first-letter:uppercase">{todayLabel}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {kreoTodo ? t("summaryTodo", { count: kreoTodo }) : t("summaryClear")}
            {agenda.available && ` · ${freeToday.totalMinutes ? t("summaryFree", { time: dur(freeToday.totalMinutes) }) : t("summaryNoFree")}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="lg">
            <Link href="/app/agenda?new=1">
              <CalendarPlus /> {t("newAgendaBlock")}
            </Link>
          </Button>
          <QuickCreatePost projects={projectChoices} />
        </div>
      </div>

      {projects.length === 0 && (
        <EmptyState icon={FolderPlus} tone="primary" body={t("noProjects")}>
          {roleAtLeast(workspace.role, "admin") && (
            <Button asChild size="lg">
              <Link href="/app/projects/new">
                <Plus /> {tp("new")}
              </Link>
            </Button>
          )}
        </EmptyState>
      )}

      {/* PRÓXIMAS PUBLICACIONES: tarjetas 9:16 con la miniatura del medio */}
      {projects.length > 0 && (
        <UpcomingStrip
          id="upcoming-title"
          title={t("upcomingTitle")}
          posts={stripPosts}
          statusLabel={(s) => ts(s)}
          aiLabel={t("aiLabel")}
          moreHref="/app/calendar?view=list"
          moreLabel={t("openGlobalCalendar")}
          newHref={projectChoices.length === 1 ? `/app/p/${projectChoices[0].id}/posts/new` : undefined}
          newLabel={t("newPostShort")}
          emptyText={t("upcomingEmpty")}
        />
      )}

      {/* HOY */}
      <section aria-labelledby="today-title" className="space-y-3">
        <h2 id="today-title" className="section-title">
          {t("todayTitle")}
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Mi agenda de hoy */}
          <Card className="lg:row-span-2">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>
                <h3>{t("agendaTitle")}</h3>
              </CardTitle>
              <Link href="/app/agenda" className="link inline-flex min-h-11 items-center text-sm sm:min-h-0">
                {t("openAgenda")}
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              {!agenda.available ? (
                <p className="text-sm text-muted-foreground">{ta("unavailable")}</p>
              ) : (
                <>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                    {freeToday.totalMinutes ? ta("freeToday", { time: dur(freeToday.totalMinutes) }) : ta("freeNone", { start: hhmm(agenda.settings.startMinute), end: hhmm(agenda.settings.endMinute) })}
                  </p>
                  {freeToday.slots.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5" aria-label={ta("freeSlotsLabel")}>
                      {freeToday.slots.map((s) => (
                        <li key={s.start} className="rounded-md border border-dashed px-2 py-1 font-mono text-xs tabular-nums">
                          {s.startTime}–{s.endTime} <span className="text-muted-foreground">· {dur(s.minutes)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {occToday.length === 0 ? (
                    <div className="rounded-lg border border-dashed px-4 py-6 text-center">
                      <p className="text-sm text-muted-foreground">{t("agendaEmpty")}</p>
                      <Button asChild size="sm" variant="ghost" className="mt-2 pointer-coarse:min-h-11">
                        <Link href="/app/agenda?new=1">
                          <Plus /> {t("agendaAdd")}
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <ul className="space-y-1.5" aria-label={t("agendaTitle")}>
                      {occToday.map((o) => (
                        <li key={`${o.blockId}-${o.day}`}>
                          <Link href={`/app/agenda?view=day&d=${b.today}`} className="block rounded-md hover:ring-1 hover:ring-border-strong">
                            {occItem(o)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button asChild size="sm" variant="outline" className="pointer-coarse:min-h-11">
                    <Link href="/app/agenda?view=day&plan=1">{ta("planDay")}</Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Lo que toca en Kreo */}
          <ul className="grid grid-cols-2 gap-3 lg:col-span-2 xl:grid-cols-4" aria-label={t("kreoTodayLabel")}>
            {tiles.map((x) => (
              <li key={x.key} className="surface flex flex-col gap-2 rounded-xl border p-4">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{x.label}</span>
                  <IconBubble icon={x.icon} size="sm" tone={x.total && x.tone !== "neutral" ? x.tone : "neutral"} />
                </span>
                {x.totalHref ? (
                  <Link href={x.totalHref} className="group inline-flex items-baseline gap-2 self-start rounded-sm" aria-label={`${x.label}: ${x.total}. ${x.hint}`}>
                    <span className={cn("font-mono text-3xl font-semibold tabular-nums", !x.total && "text-muted-foreground")}>{x.total}</span>
                    <ArrowRight className="size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none" aria-hidden />
                  </Link>
                ) : (
                  <span className={cn("font-mono text-3xl font-semibold tabular-nums", !x.total && "text-muted-foreground")}>{x.total}</span>
                )}
                <span className="text-xs text-muted-foreground">{x.hint}</span>
                {x.rows.length > 0 && (
                  <ul className="-mx-1.5 mt-auto space-y-0.5 border-t pt-2">
                    {x.rows.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={x.href(r.id)}
                          aria-label={`${r.name}: ${r.count} · ${x.label}`}
                          className="flex min-h-8 items-center gap-2 rounded-md px-1.5 text-xs hover:bg-accent/40 pointer-coarse:min-h-11"
                        >
                          <ProjectDot id={r.id} />
                          <span className="min-w-0 flex-1 truncate">{r.name}</span>
                          <span className="font-mono font-semibold tabular-nums">{r.count}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          {/* Publicaciones de hoy */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>
                <h3>{t("postsTodayTitle")}</h3>
              </CardTitle>
              <Link href={`/app/calendar?view=week&d=${b.today}`} className="link inline-flex min-h-11 items-center text-sm sm:min-h-0">
                {t("openGlobalCalendar")}
              </Link>
            </CardHeader>
            <CardContent>
              {todayPosts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("postsTodayEmpty")}</p>
              ) : (
                <ul className="-mx-2 divide-y">
                  {todayPosts.slice(0, 8).map((p) => (
                    <li key={p.id}>
                      <Link href={`/app/p/${p.project_id}/posts/${p.id}`} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2 py-2 hover:bg-accent/40 sm:flex-nowrap">
                        <PostThumb cover={covers.get(p.id)} className="size-12 shrink-0 rounded-xl" />
                        <time dateTime={p.scheduled_at!} className="w-12 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                          {p.time}
                        </time>
                        <span className="inline-flex max-w-40 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <ProjectDot id={p.project_id} />
                          <span className="truncate">{nameOf.get(p.project_id)}</span>
                        </span>
                        <span className="flex shrink-0 gap-1">
                          {p.platforms.map((pl) => (
                            <PlatformIcon key={pl} platform={pl} label className="size-5 text-[8px]" />
                          ))}
                        </span>
                        <span className="order-last w-full min-w-0 truncate text-sm sm:order-none sm:w-auto sm:flex-1">{p.label}</span>
                        <StatusBadge status={p.status as PostStatus} label={ts(p.status)} className="ml-auto sm:ml-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* PROYECTOS */}
      {projects.length > 0 && (
        <section aria-labelledby="projects-title" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="projects-title" className="section-title">
              {t("projectsTitle")}
            </h2>
            <Link href="/app/projects" className="link inline-flex min-h-11 items-center text-sm sm:min-h-0">
              {t("allProjects")}
            </Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => {
              const pAccs = accs.filter((a) => a.project_id === project.id);
              const next = nextPost.get(project.id);
              const pending = pendingCounts.get(project.id) ?? 0;
              const base = `/app/p/${project.id}`;
              return (
                <li key={project.id}>
                  <article className="surface lift flex h-full flex-col rounded-xl border" aria-labelledby={`p-${project.id}`}>
                    <header className="flex items-center gap-3 p-4 pb-3">
                      <ProjectAvatar id={project.id} name={project.name} />
                      <h3 id={`p-${project.id}`} className="min-w-0 flex-1 truncate text-lg">
                        <Link href={base} className="hover:underline">
                          {project.name}
                        </Link>
                      </h3>
                      <Button asChild variant="ghost" size="icon-sm" aria-label={t("openPanel", { name: project.name })}>
                        <Link href={base}>
                          <LayoutDashboard />
                        </Link>
                      </Button>
                    </header>

                    <div className="flex-1 px-4">
                      {pAccs.length === 0 ? (
                        <Link href={`${base}/accounts`} className="flex min-h-11 items-center gap-2 rounded-lg border border-dashed px-3 text-sm text-muted-foreground hover:border-border-strong hover:text-foreground">
                          <Plug className="size-4" strokeWidth={1.5} aria-hidden /> {t("connectAccounts")}
                        </Link>
                      ) : (
                        <ul className="divide-y">
                          {pAccs.map((a) => {
                            const s = stats.get(a.id)!;
                            const yt = a.platform === "youtube";
                            const handle = a.handle ? `@${a.handle.replace(/^@/, "")}` : (a.display_name ?? a.platform);
                            return (
                              <li key={a.id} className="flex items-center gap-2.5 py-2">
                                <PlatformIcon platform={a.platform} label className="size-7" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm">{handle}</span>
                                  {a.status !== "active" ? (
                                    <Link href={`${base}/accounts`} className="inline-flex items-center gap-1 text-xs text-warning hover:underline">
                                      <AlertTriangle className="size-3" aria-hidden /> {t("reconnect")}
                                    </Link>
                                  ) : (
                                    <span className="block text-xs text-muted-foreground">{yt ? t("subscribers") : t("followers")}</span>
                                  )}
                                </span>
                                {s.series.length >= 2 && !yt && <Sparkline values={s.series.map((x) => x.value)} label={t("sparkLabel", { handle })} className="hidden w-16 text-muted-foreground sm:block" />}
                                <span className="text-right">
                                  <span className="block font-mono text-sm font-semibold tabular-nums">{s.hasData ? n(s.followers) : "—"}</span>
                                  {/* YouTube: cifras tal cual, sin variaciones derivadas ni sumas con otras redes. */}
                                  {!yt && s.delta7 !== undefined && (
                                    <span className={cn("block font-mono text-[11px] tabular-nums", s.delta7 > 0 ? "text-success" : s.delta7 < 0 ? "text-destructive" : "text-muted-foreground")}>
                                      {t("change7", { value: signed(s.delta7) })}
                                    </span>
                                  )}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-3 border-t px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <dt className="label-mono">{t("nextPost")}</dt>
                        <dd className="truncate">
                          {next ? (
                            <Link href={`${base}/posts/${next.id}`} className="hover:underline">
                              <span className="font-mono text-xs tabular-nums">
                                {format.dateTime(new Date(next.scheduled_at!), { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: DEFAULT_DAY.timezone })}
                              </span>{" "}
                              <span className="text-muted-foreground">{next.title?.trim() || next.caption.trim().slice(0, 60) || tp("noCaption")}</span>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">{t("nothingScheduled")}</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="label-mono">{t("tilePending")}</dt>
                        <dd>
                          <Link href={`${base}/calendar?status=pending_approval`} className={cn("font-mono font-semibold tabular-nums hover:underline", pending ? "text-warning" : "text-muted-foreground")} aria-label={`${t("tilePending")}: ${pending}`}>
                            {pending}
                          </Link>
                        </dd>
                      </div>
                    </dl>

                    <footer className="flex flex-wrap gap-2 border-t px-4 py-3">
                      {canEdit && (
                        <Button asChild size="sm" variant="outline" className="pointer-coarse:min-h-11">
                          <Link href={`${base}/posts/new`}>
                            <Plus /> {t("newPostShort")}
                          </Link>
                        </Button>
                      )}
                      <Button asChild size="sm" variant="ghost" className="pointer-coarse:min-h-11">
                        <Link href={`${base}/calendar`}>
                          <CalendarDays /> {t("calendar")}
                        </Link>
                      </Button>
                    </footer>
                  </article>
                </li>
              );
            })}
          </ul>
          {accs.some((a) => a.platform === "youtube") && <p className="text-xs text-muted-foreground">{t("youtubeNote")}</p>}
        </section>
      )}

      {/* SEMANA + CRÉDITOS */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>
              <h2>{t("weekTitle")}</h2>
            </CardTitle>
            <div className="flex flex-wrap gap-x-4">
              <Link href="/app/agenda?view=week" className="link inline-flex min-h-11 items-center text-sm sm:min-h-0">
                {t("openAgendaWeek")}
              </Link>
              <Link href="/app/calendar?view=week" className="link inline-flex min-h-11 items-center text-sm sm:min-h-0">
                {t("openGlobalCalendar")}
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2 md:grid-cols-7" aria-label={t("weekStripLabel")}>
              {weekDays.map((day) => {
                const dayOcc = occ.filter((o) => o.day === day);
                const dayPosts = posts.filter((p) => p.day === day);
                const items = [
                  ...dayOcc.map((o) => ({ key: `o-${o.blockId}`, minute: o.startMinute, node: occItem(o, true) })),
                  ...dayPosts.map((p) => ({
                    key: `p-${p.id}`,
                    minute: zonedParts(new Date(p.scheduled_at!), DEFAULT_DAY.timezone).minutes,
                    node: (
                      <Link href={`/app/p/${p.project_id}/posts/${p.id}`} className="flex min-w-0 items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs hover:border-border-strong" title={`${nameOf.get(p.project_id)} · ${p.label}`}>
                        <ProjectDot id={p.project_id} />
                        <span className="font-mono text-muted-foreground tabular-nums">{p.time}</span>
                        {p.platforms[0] && <PlatformIcon platform={p.platforms[0]} className="size-3.5 shrink-0" />}
                        <span className="min-w-0 truncate md:sr-only">{p.label}</span>
                        <span className="sr-only">· {nameOf.get(p.project_id)} · {ts(p.status)}</span>
                      </Link>
                    ),
                  })),
                ].sort((a, b2) => a.minute - b2.minute);
                const shown = items.slice(0, 5);
                const isToday = day === b.today;
                return (
                  <li key={day} className={cn("min-w-0 rounded-lg border p-2", isToday && "border-selected")}>
                    <Link href={`/app/agenda?view=day&d=${day}`} aria-current={isToday ? "date" : undefined} className="mb-1.5 flex items-baseline gap-1.5 hover:underline md:flex-col md:items-center md:gap-0">
                      <span className="label-mono !text-[10px]">{format.dateTime(dayDate(day), { weekday: "short", timeZone: "UTC" }).replace(".", "")}</span>
                      <span className="text-sm font-medium tabular-nums">{format.dateTime(dayDate(day), { day: "numeric", timeZone: "UTC" })}</span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground md:ml-0">{t("itemsCount", { count: items.length })}</span>
                    </Link>
                    {shown.length ? (
                      <ul className="space-y-1">
                        {shown.map((it) => (
                          <li key={it.key} className="min-w-0">
                            {it.node}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-center text-xs text-muted-foreground">·</p>
                    )}
                    {items.length > shown.length && <p className="mt-1 text-[11px] text-muted-foreground">{t("more", { count: items.length - shown.length })}</p>}
                  </li>
                );
              })}
            </ol>
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
                <dd className="flex items-center gap-1.5 font-mono text-2xl font-semibold tabular-nums">
                  <Coins className="size-4 text-brand-amber-ink" aria-hidden />
                  {format.number(credits)}
                </dd>
              </div>
              <div>
                <dt className="label-mono">{t("creditsSpent")}</dt>
                <dd className="font-mono text-2xl font-semibold tabular-nums">{format.number(spent)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">{t("creditsNote", { monthly: format.number(plan.monthly_credits) })}</p>
            <Button asChild size="sm" variant="outline" className="pointer-coarse:min-h-11">
              <Link href="/app/billing">
                {t("buyCredits")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
