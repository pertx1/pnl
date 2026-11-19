"use client";

import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState, useSyncExternalStore, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Archive, ArchiveRestore, BellRing, CalendarDays, ChevronDown, Flame, LifeBuoy, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { addDaysIso, localIsoDay } from "@/lib/strategy/dates";
import { CREDITS, WARMUP_ISSUES, type WarmupCategory, type WarmupIssue } from "@/lib/strategy/schema";
import { currentPlanDay, overdueCount, planProgress, planStreak, todayPendingCount } from "@/lib/strategy/warmup";
import { cn } from "@/lib/utils";
import { Cost } from "../strategy/_components/cost";
import { ProgressBar } from "../strategy/_components/fields";
import { adjustWarmupPlan, aiCoachWarmup, deleteWarmupPlan, setWarmupReminder, setWarmupStatus, toggleWarmupTask } from "./actions";

type Task = { id: string; day: number; category: WarmupCategory; title: string; detail: string; targetCount: number | null; source: string; done: boolean };
type Plan = {
  id: string;
  platform: string;
  label: string;
  planned: boolean;
  niche: string;
  startDate: string;
  durationDays: number;
  status: string;
  issues: string[];
  source: string;
  reminderMine: boolean;
  reminderOther: boolean;
};

const CATEGORY_COLOR: Record<WarmupCategory, string> = {
  profile: "var(--info)",
  content: "var(--primary-ink)",
  engage: "var(--brand-amber-ink)",
  safety: "var(--warning)",
  learn: "var(--muted-foreground)",
};

const noop = () => () => {};
function localToday() {
  const now = new Date();
  return localIsoDay(now, now.getTimezoneOffset());
}
function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

export function PlanView({ projectId, plan, tasks, canEdit, aiReady, balance }: { projectId: string; plan: Plan; tasks: Task[]; canEdit: boolean; aiReady: boolean; balance: number }) {
  const t = useTranslations("warmup");
  const te = useTranslations("strategy.errors");
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  // Día local del usuario (en el servidor se usa UTC y se corrige al hidratar).
  const today = useSyncExternalStore(noop, localToday, utcToday);
  const [optimistic, setOptimistic] = useOptimistic(tasks, (state: Task[], u: { id: string; done: boolean }) => state.map((x) => (x.id === u.id ? { ...x, done: u.done } : x)));
  const [issues, setIssues] = useState<WarmupIssue[]>([]);

  const day = currentPlanDay(plan.startDate, today, plan.durationDays);
  const progress = planProgress(optimistic);
  const streak = planStreak(optimistic, Math.min(day, plan.durationDays));
  const overdue = overdueCount(optimistic, day);
  const todayLeft = day >= 1 && day <= plan.durationDays ? todayPendingCount(optimistic, day) : 0;
  const days = useMemo(() => Array.from({ length: plan.durationDays }, (_, i) => i + 1), [plan.durationDays]);
  const [openDays, setOpenDays] = useState<Set<number>>(() => new Set([Math.min(Math.max(day, 1), plan.durationDays)]));
  const ro = !canEdit || plan.status === "archived";
  const fromDay = Math.min(Math.max(day, 1), plan.durationDays);
  const fail = (e: string) => {
    toast.error(te.has(e) ? te(e) : te("generic"));
  };
  const fmtDay = (n: number) => format.dateTime(new Date(`${addDaysIso(plan.startDate, n - 1)}T12:00:00`), { weekday: "short", day: "numeric", month: "short" });

  function toggle(task: Task, done: boolean) {
    start(async () => {
      setOptimistic({ id: task.id, done });
      const r = await toggleWarmupTask(projectId, task.id, done);
      if (!r.ok) return fail(r.error);
      router.refresh();
    });
  }
  function reminder(enabled: boolean) {
    start(async () => {
      const r = await setWarmupReminder(projectId, plan.id, enabled);
      if (!r.ok) return fail(r.error);
      toast.success(enabled ? t("reminders.on") : t("reminders.off"));
      router.refresh();
    });
  }
  function adjust(ai: boolean) {
    start(async () => {
      if (ai) {
        const r = await aiCoachWarmup({ projectId, planId: plan.id, issues, fromDay, idempotencyKey: crypto.randomUUID() });
        if (!r.ok) return fail(r.error);
        toast.success(t("coach.done"), { description: r.data.tips.slice(0, 2).join(" · ") || undefined });
      } else {
        const r = await adjustWarmupPlan({ projectId, planId: plan.id, issues, fromDay });
        if (!r.ok) return fail(r.error);
        toast.success(r.data.added ? t("issues.added", { count: r.data.added }) : t("issues.nothingNew"));
      }
      setIssues([]);
      router.refresh();
    });
  }
  function status(s: "active" | "archived") {
    start(async () => {
      const r = await setWarmupStatus(projectId, plan.id, s);
      if (!r.ok) return fail(r.error);
      router.refresh();
    });
  }
  function remove() {
    start(async () => {
      const r = await deleteWarmupPlan(projectId, plan.id);
      if (!r.ok) return fail(r.error);
      router.push(`/app/p/${projectId}/warmup`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Cabecera del plan */}
      <Card>
        <CardContent className="flex flex-wrap items-start gap-3">
          <PlatformIcon platform={plan.platform} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {plan.label}
              {plan.planned && <span className="rounded-sm border border-border px-1.5 py-px text-[11px] font-normal text-muted-foreground">{t("plannedAccount")}</span>}
              {plan.status !== "active" && <span className="rounded-sm border border-border px-1.5 py-px text-[11px] font-normal text-muted-foreground">{t(`status.${plan.status}`)}</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {plan.niche ? `${plan.niche} · ` : ""}
              {t("dates", { from: fmtDay(1), to: fmtDay(plan.durationDays), days: plan.durationDays })}
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-1">
              {plan.status === "archived" ? (
                <Button variant="ghost" size="sm" onClick={() => status("active")} disabled={pending}>
                  <ArchiveRestore /> {t("unarchive")}
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => status("archived")} disabled={pending}>
                  <Archive /> {t("archive")}
                </Button>
              )}
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={t("delete")} className="text-muted-foreground hover:text-destructive">
                    <Trash2 />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("deleteTitle")}</DialogTitle>
                    <DialogDescription>{t("deleteBody")}</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="destructive" onClick={remove} disabled={pending}>
                      <Trash2 /> {t("delete")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Métricas del plan */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardContent className="space-y-2">
            <p className="label-mono">{t("stats.progress")}</p>
            <p className="font-mono text-2xl tabular-nums">{progress.percent} %</p>
            <ProgressBar value={progress.percent} label={t("stats.progress")} />
            <p className="font-mono text-xs tabular-nums text-muted-foreground">{t("stats.tasks", { done: progress.done, total: progress.total })}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-2">
            <p className="label-mono">{t("stats.streak")}</p>
            <p className="flex items-center gap-2 font-mono text-2xl tabular-nums">
              <Flame className={cn("size-5", streak > 0 ? "text-brand-amber-ink" : "text-muted-foreground")} strokeWidth={1.5} aria-hidden />
              {t("stats.streakDays", { count: streak })}
            </p>
            <p className="text-xs text-muted-foreground">{t("stats.streakHelp")}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-2">
            <p className="label-mono">{t("stats.day")}</p>
            <p className="flex items-center gap-2 font-mono text-2xl tabular-nums">
              <CalendarDays className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              {day === 0 ? "—" : day > plan.durationDays ? t("stats.finished") : `${day}/${plan.durationDays}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {day === 0 ? t("stats.startsOn", { date: fmtDay(1) }) : day > plan.durationDays ? t("stats.finishedHelp") : t("stats.todayLeft", { count: todayLeft })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recordatorios */}
      {plan.status === "active" && (
        <Card size="sm">
          <CardContent className="space-y-3">
            {overdue > 0 && (
              <p role="status" className="flex items-start gap-2 rounded-md bg-warning/10 p-2 text-sm text-warning">
                <BellRing className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden /> {t("reminders.overdue", { count: overdue })}
              </p>
            )}
            {overdue === 0 && todayLeft > 0 && (
              <p className="flex items-start gap-2 text-sm">
                <BellRing className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden /> {t("reminders.today", { count: todayLeft })}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="wp-reminder" className="flex flex-col items-start gap-0.5">
                <span>{t("reminders.email")}</span>
                <span className="text-xs font-normal text-muted-foreground">{plan.reminderOther && !plan.reminderMine ? t("reminders.other") : t("reminders.emailHelp")}</span>
              </Label>
              <Switch id="wp-reminder" checked={plan.reminderMine} disabled={!canEdit || pending} onCheckedChange={reminder} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Checklist diaria */}
      <Card>
        <CardHeader>
          <CardTitle className="label-mono">{t("checklist.title")}</CardTitle>
          <CardDescription>{t("checklist.help")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {days.map((n) => {
            const list = optimistic.filter((x) => x.day === n);
            const done = list.filter((x) => x.done).length;
            const isOpen = openDays.has(n);
            const isToday = n === day;
            const complete = list.length > 0 && done === list.length;
            return (
              <section key={n} className={cn("rounded-md border", isToday ? "border-primary-ink/50" : "border-border")}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`wd-${n}`}
                    onClick={() => setOpenDays((s) => { const c = new Set(s); if (c.has(n)) c.delete(n); else c.add(n); return c; })}
                    className="flex w-full items-center gap-3 rounded-md p-3 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-md font-mono text-xs tabular-nums", complete ? "bg-success/15 text-success" : "bg-secondary")}>{n}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {t("checklist.day", { n })} {isToday && <span className="ml-1 text-xs font-medium text-foreground">· {t("checklist.today")}</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground">{fmtDay(n)}</span>
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{done}/{list.length}</span>
                    <ChevronDown className={cn("size-4 text-muted-foreground transition-transform motion-reduce:transition-none", isOpen && "rotate-180")} aria-hidden />
                  </button>
                </h3>
                {isOpen && (
                  <ul id={`wd-${n}`} className="space-y-1 border-t border-border p-2">
                    {list.length === 0 && <li className="p-2 text-sm text-muted-foreground">{t("checklist.emptyDay")}</li>}
                    {list.map((task) => (
                      <li key={task.id} className="flex items-start gap-3 rounded-md p-2 hover:bg-accent/50">
                        <Checkbox id={`wt-${task.id}`} checked={task.done} disabled={ro || pending} onCheckedChange={(v) => toggle(task, v === true)} className="mt-0.5" />
                        <label htmlFor={`wt-${task.id}`} className="min-w-0 flex-1 cursor-pointer">
                          <span className={cn("block text-sm", task.done && "text-muted-foreground line-through")}>
                            {task.title}
                            {task.targetCount ? <span className="ml-1.5 font-mono text-xs tabular-nums text-muted-foreground">×{task.targetCount}</span> : null}
                          </span>
                          {task.detail && <span className="block text-xs text-muted-foreground">{task.detail}</span>}
                        </label>
                        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                          {task.source === "ai" && <Sparkles className="size-3 text-brand-amber-ink" aria-label={t("checklist.aiTask")} />}
                          <span className="hidden items-center gap-1 sm:inline-flex">
                            <span aria-hidden className="size-1.5 rounded-full" style={{ background: CATEGORY_COLOR[task.category] }} />
                            {t(`categories.${task.category}`)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </CardContent>
      </Card>

      {/* Problemas y ajustes */}
      {!ro && (
        <Card>
          <CardHeader>
            <CardTitle className="label-mono flex items-center gap-1.5">
              <LifeBuoy className="size-3.5" aria-hidden /> {t("issues.title")}
            </CardTitle>
            <CardDescription>{t("issues.help")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">{t("issues.title")}</legend>
              {WARMUP_ISSUES.map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <Checkbox id={`wi-${i}`} checked={issues.includes(i)} onCheckedChange={(v) => setIssues((s) => (v === true ? [...s, i] : s.filter((x) => x !== i)))} />
                  <Label htmlFor={`wi-${i}`} className="font-normal">
                    {t(`issues.list.${i}`)}
                    {plan.issues.includes(i) && <span className="ml-1 text-xs text-muted-foreground">({t("issues.reported")})</span>}
                  </Label>
                </div>
              ))}
            </fieldset>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" disabled={pending || !issues.length} onClick={() => adjust(false)}>
                <Wand2 /> {t("issues.adjust")}
              </Button>
              {aiReady ? (
                <>
                  <Button variant="brand" size="sm" disabled={pending || balance < CREDITS.coach} onClick={() => adjust(true)}>
                    <Sparkles /> {issues.length ? t("issues.adjustAi") : t("coach.personalize")}
                  </Button>
                  <Cost credits={CREDITS.coach} balance={balance} />
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{t("coach.notConfigured")}</span>
              )}
            </div>
            {aiReady && <p className="text-xs text-muted-foreground">{t("coach.replaceNote", { day: fromDay })}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
