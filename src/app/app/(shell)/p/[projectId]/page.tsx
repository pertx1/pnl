import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CalendarDays,
  Check,
  Coins,
  Flame,
  Lightbulb,
  Map,
  PackageSearch,
  Palette,
  Plug,
  Plus,
  Scissors,
  Sparkles,
  Swords,
  UserCheck,
} from "lucide-react";
import { StatCard } from "@/components/kreo/stat-card";
import { StatusBadge } from "@/components/kreo/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBrandKit, getCreditBalance, getProject } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/app/p/[projectId]">) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  return { title: project.name };
}

/** Límites del periodo "próximos 7 días" (fuera del componente: el lint de React no permite Date.now() al renderizar). */
function window7d() {
  const now = Date.now();
  return { from: new Date(now).toISOString(), to: new Date(now + 7 * 86400000).toISOString() };
}

export default async function ProjectPage({ params }: PageProps<"/app/p/[projectId]">) {
  const { projectId } = await params;
  const t = await getTranslations("projects");
  const tn = await getTranslations("nav");
  const ts = await getTranslations("posts.status");
  const format = await getFormatter();
  const project = await getProject(projectId);
  const kit = await getBrandKit(projectId);
  const kitDone = Boolean(kit.tone_of_voice && kit.target_audience);
  const supabase = await createClient();
  const { from, to } = window7d();
  const base = `/app/p/${projectId}`;

  const [{ count: accountsCount }, { count: postsCount }, { count: weekCount }, { count: pendingCount }, { data: upcoming }, credits] = await Promise.all([
    supabase.from("social_accounts").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("project_id", projectId).in("status", ["scheduled", "published"]),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "scheduled").gte("scheduled_at", from).lte("scheduled_at", to),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "pending_approval"),
    supabase
      .from("posts")
      .select("id, caption, status, scheduled_at")
      .eq("project_id", projectId)
      .in("status", ["scheduled", "pending_approval", "approved", "draft"])
      .gte("scheduled_at", from)
      .order("scheduled_at")
      .limit(6),
    getCreditBalance(project.workspace_id),
  ]);

  const steps = [
    { icon: Palette, title: t("stepBrandKit"), body: t("stepBrandKitBody"), href: `${base}/brand-kit`, done: kitDone },
    { icon: Plug, title: t("stepAccounts"), body: t("stepAccountsBody"), href: `${base}/accounts`, done: (accountsCount ?? 0) > 0 },
    // Sin publicaciones, el paso lleva directo a crear la primera (no al calendario vacío).
    { icon: CalendarDays, title: t("stepCalendar"), body: t("stepCalendarBody"), href: (postsCount ?? 0) > 0 ? `${base}/calendar` : `${base}/posts/new`, done: (postsCount ?? 0) > 0 },
  ];
  const tools = [
    { href: `${base}/studio`, icon: Sparkles, label: tn("studio"), body: t("toolStudio") },
    { href: `${base}/clipper`, icon: Scissors, label: tn("clipper"), body: t("toolClipper") },
    { href: `${base}/inspiration`, icon: Lightbulb, label: tn("inspiration"), body: t("toolInspiration") },
    { href: `${base}/analytics`, icon: BarChart3, label: tn("analytics"), body: t("toolAnalytics") },
    { href: `${base}/competitors`, icon: Swords, label: tn("competitors"), body: t("toolCompetitors") },
    { href: `${base}/products`, icon: PackageSearch, label: tn("products"), body: t("toolProducts") },
    { href: `${base}/strategy`, icon: Map, label: tn("strategy"), body: t("toolStrategy") },
    { href: `${base}/warmup`, icon: Flame, label: tn("warmup"), body: t("toolWarmup") },
  ];

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-mono">{project.workspace.name}</p>
          <h1 className="text-[28px] leading-tight font-medium">{project.name}</h1>
          {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`${base}/studio`}>
              <Sparkles /> {t("generate")}
            </Link>
          </Button>
          <Button asChild>
            <Link href={`${base}/posts/new`}>
              <Plus /> {t("newPost")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("statAccounts")} value={String(accountsCount ?? 0)} trend="flat" icon={Plug} />
        <StatCard label={t("statScheduled")} value={String(weekCount ?? 0)} trend="flat" icon={CalendarClock} />
        <StatCard label={t("statPending")} value={String(pendingCount ?? 0)} trend="flat" icon={UserCheck} />
        <StatCard label={t("statCredits")} value={format.number(credits)} trend="flat" icon={Coins} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>{t("upcoming")}</CardTitle>
            <Link href={`${base}/calendar`} className="link text-sm">
              {t("viewCalendar")}
            </Link>
          </CardHeader>
          <CardContent>
            {(upcoming ?? []).length === 0 ? (
              <div className="bg-dots flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
                <CalendarDays className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                <p className="max-w-sm text-sm text-muted-foreground">{t("upcomingEmpty")}</p>
                <Button asChild size="sm" variant="outline">
                  <Link href={`${base}/posts/new`}>
                    <Plus /> {t("newPost")}
                  </Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y">
                {(upcoming ?? []).map((p) => (
                  <li key={p.id}>
                    <Link href={`${base}/posts/${p.id}`} className="flex items-center gap-4 py-3 hover:bg-accent/40">
                      <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                        {p.scheduled_at ? format.dateTime(new Date(p.scheduled_at), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{p.caption?.trim() || t("noCaption")}</span>
                      <StatusBadge status={p.status} label={ts(p.status)} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("nextSteps")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1">
              {steps.map((s) => (
                <li key={s.title}>
                  <Link href={s.href} className="flex items-start gap-3 rounded-lg p-2 hover:bg-accent/40">
                    <span
                      className={cn(
                        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border",
                        s.done ? "border-success/40 bg-success/15 text-success" : "text-muted-foreground",
                      )}
                    >
                      {s.done ? <Check className="size-3.5" aria-label={t("done")} /> : <s.icon className="size-3.5" aria-hidden />}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block text-sm font-medium", s.done && "text-muted-foreground line-through decoration-border-strong")}>{s.title}</span>
                      <span className="block text-xs text-muted-foreground">{s.body}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="label-mono">{t("tools")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="surface group flex items-start gap-3 rounded-xl p-4 transition-colors hover:border-border-strong"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-secondary">
                <tool.icon className="size-4 text-muted-foreground group-hover:text-foreground" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  {tool.label}
                  <ArrowRight className="size-4 -translate-x-1 text-muted-foreground opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none" aria-hidden />
                </span>
                <span className="block text-xs text-muted-foreground">{tool.body}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
