import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BadgeCheck, Ban, Clock, Copy, Flame, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isAgentsConfigured } from "@/lib/agents/client";
import { getCreditBalance, getProject, roleAtLeast } from "@/lib/server/dal";
import { accountLabel, getProjectAccounts } from "@/lib/strategy/data";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { NewPlanForm } from "./new-plan-form";
import { PlanView } from "./plan-view";

export async function generateMetadata() {
  const t = await getTranslations("warmup");
  return { title: t("title") };
}

const PRACTICES = [
  { key: "profile", icon: UserRound },
  { key: "frequency", icon: Clock },
  { key: "original", icon: Copy },
  { key: "aiLabel", icon: Sparkles },
  { key: "noBuy", icon: Ban },
  { key: "device", icon: ShieldCheck },
] as const;

export default async function WarmupPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ plan?: string; new?: string }> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const t = await getTranslations("warmup");
  const project = await getProject(projectId);
  const canEdit = roleAtLeast(project.workspace.role, "editor");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  const [accounts, { data: plans }, balance] = await Promise.all([
    getProjectAccounts(supabase, projectId),
    supabase.from("warmup_plans").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
    getCreditBalance(project.workspace_id),
  ]);
  const visible = (plans ?? []).filter((p) => p.status !== "archived" || p.id === sp.plan);
  const selected = visible.find((p) => p.id === sp.plan) ?? (sp.new ? null : visible[0]) ?? null;
  const { data: tasks } = selected
    ? await supabase.from("warmup_tasks").select("id, day, position, category, title, detail, target_count, source, done_at").eq("plan_id", selected.id).order("day").order("position")
    : { data: [] };
  const { data: counts } = visible.length
    ? await supabase.from("warmup_tasks").select("plan_id, done_at").in("plan_id", visible.map((p) => p.id))
    : { data: [] };
  const progressOf = (id: string) => {
    const all = (counts ?? []).filter((c) => c.plan_id === id);
    return all.length ? Math.round((all.filter((c) => c.done_at).length / all.length) * 100) : 0;
  };
  const label = (p: { social_account_id: string | null; handle: string | null; platform: string }) => {
    const acc = accounts.find((a) => a.id === p.social_account_id);
    return acc ? accountLabel(acc) : p.handle ? `@${p.handle}` : t("plannedAccount");
  };
  const attention = visible.filter((p) => p.needs_attention && p.status === "active");
  const showForm = canEdit && (!selected || sp.new);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-mono">{project.name}</p>
          <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canEdit && selected && !sp.new && (
          <Link href={`/app/p/${projectId}/warmup?new=1`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 focus-visible:outline-2 focus-visible:outline-ring">
            <Flame className="size-4" strokeWidth={1.5} aria-hidden /> {t("newPlan")}
          </Link>
        )}
      </div>

      <p className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-sm">
        <BadgeCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        <span>{t("manualOnly")}</span>
      </p>

      {attention.length > 0 && (
        <div role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="font-medium">{t("attention.title")}</p>
          <ul className="mt-1 space-y-0.5">
            {attention.map((p) => (
              <li key={p.id}>
                <Link href={`/app/p/${projectId}/warmup?plan=${p.id}`} className="underline-offset-4 hover:underline">
                  {t("attention.item", { account: label(p), count: p.pending_count })}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {visible.length > 0 && (
        <nav aria-label={t("plans")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {visible.map((p) => {
            const active = p.id === selected?.id && !sp.new;
            const pct = progressOf(p.id);
            return (
              <Link
                key={p.id}
                href={`/app/p/${projectId}/warmup?plan=${p.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-48 shrink-0 flex-col gap-1.5 rounded-md border p-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                  active ? "border-primary-ink/60 bg-accent" : "border-border hover:bg-accent",
                )}
              >
                <span className="flex items-center gap-2">
                  <PlatformIcon platform={p.platform} className="size-5 text-[8px]" />
                  <span className="truncate">{label(p)}</span>
                  {p.status !== "active" && <span className="ml-auto text-[11px] text-muted-foreground">{t(`status.${p.status}`)}</span>}
                </span>
                <span className="h-1 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
                  <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${pct}%` }} />
                </span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{t("progressPct", { pct })}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {showForm ? (
        <NewPlanForm
          projectId={projectId}
          accounts={accounts.map((a) => ({ id: a.id, platform: a.platform, label: accountLabel(a) }))}
          aiReady={isAgentsConfigured()}
          balance={balance}
          cancelHref={selected ? `/app/p/${projectId}/warmup?plan=${selected.id}` : null}
        />
      ) : selected ? (
        <PlanView
          key={selected.id}
          projectId={projectId}
          plan={{
            id: selected.id,
            platform: selected.platform,
            label: label(selected),
            planned: !selected.social_account_id,
            niche: selected.niche,
            startDate: selected.start_date,
            durationDays: selected.duration_days,
            status: selected.status,
            issues: selected.issues,
            source: selected.source,
            reminderMine: Boolean(auth.user && selected.reminder_user_id === auth.user.id),
            reminderOther: Boolean(selected.reminder_user_id && selected.reminder_user_id !== auth.user?.id),
          }}
          tasks={(tasks ?? []).map((x) => ({ id: x.id, day: x.day, category: x.category, title: x.title, detail: x.detail, targetCount: x.target_count, source: x.source, done: Boolean(x.done_at) }))}
          canEdit={canEdit}
          aiReady={isAgentsConfigured()}
          balance={balance}
        />
      ) : (
        <Card className="bg-dots">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Flame className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <h2 className="text-lg font-medium">{t("empty.title")}</h2>
            <p className="max-w-md text-sm text-muted-foreground">{t("empty.body")}</p>
            {!canEdit && <p className="text-xs text-muted-foreground">{t("readOnly")}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="label-mono">{t("practices.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PRACTICES.map(({ key, icon: Icon }) => (
              <li key={key} className="flex gap-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                <span>
                  <span className="block text-sm font-medium">{t(`practices.${key}.title`)}</span>
                  <span className="block text-xs text-muted-foreground">{t(`practices.${key}.body`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
