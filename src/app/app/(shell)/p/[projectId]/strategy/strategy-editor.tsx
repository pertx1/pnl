"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, CalendarPlus, ExternalLink, Flag, Plus, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AiBadge } from "@/components/kreo/ai-badge";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CREDITS, PLATFORMS, TASK_STATUSES, type Milestone, type Platform, type RoadmapTask, type StrategyDoc } from "@/lib/strategy/schema";
import { defaultFrequency } from "@/lib/strategy/templates";
import { cn } from "@/lib/utils";
import { Cost } from "./_components/cost";
import { move, NativeSelect, ProgressBar, RowActions } from "./_components/fields";
import { deleteStrategy, saveStrategy, taskToCalendar } from "./actions";
import { aiGenerateStrategy } from "./ai-actions";
import { PlannerDialog } from "./planner-dialog";

const PLATFORM_NAME: Record<Platform, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function StrategyEditor(props: {
  projectId: string;
  strategyId: string;
  scopeLabel: string;
  accountId: string | null;
  initial: StrategyDoc;
  source: string;
  updatedAt: string;
  canEdit: boolean;
  aiReady: boolean;
  balance: number;
  people: { id: string; name: string }[];
  postStatus: Record<string, string>;
  hasActiveAccounts: boolean;
}) {
  const { projectId, strategyId, canEdit } = props;
  const t = useTranslations("strategy");
  const te = useTranslations("strategy.errors");
  const format = useFormatter();
  const router = useRouter();
  const [doc, setDoc] = useState<StrategyDoc>(props.initial);
  const [pending, start] = useTransition();
  const dirty = useMemo(() => JSON.stringify(doc) !== JSON.stringify(props.initial), [doc, props.initial]);
  const ro = !canEdit;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const fail = (error: string) => {
    toast.error(te.has(error) ? te(error) : te("generic"));
  };
  const set = <K extends keyof StrategyDoc>(k: K, v: StrategyDoc[K]) => setDoc((d) => ({ ...d, [k]: v }));
  const setMilestone = (i: number, patch: Partial<Milestone>) => set("milestones", doc.milestones.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const setTask = (mi: number, ti: number, patch: Partial<RoadmapTask>) =>
    setMilestone(mi, { tasks: doc.milestones[mi].tasks.map((x, j) => (j === ti ? { ...x, ...patch } : x)) });

  const shareTotal = doc.pillars.reduce((a, p) => a + p.share, 0);
  const usedPlatforms = new Set(doc.frequency.map((f) => f.platform));

  function save() {
    start(async () => {
      const r = await saveStrategy({ projectId, strategyId, doc });
      if (!r.ok) return fail(r.error);
      toast.success(t("saved"));
      router.refresh();
    });
  }
  function toCalendar(taskId: string) {
    start(async () => {
      const r = await taskToCalendar({ projectId, taskId, tzOffset: new Date().getTimezoneOffset() });
      if (!r.ok) return fail(r.error);
      toast.success(r.data.targeted ? t("roadmap.toCalendarDone") : t("roadmap.toCalendarNoAccount"), {
        action: { label: t("roadmap.openDraft"), onClick: () => router.push(`/app/p/${projectId}/posts/${r.data.postId}`) },
      });
      router.refresh();
    });
  }
  function remove() {
    start(async () => {
      const r = await deleteStrategy(projectId, strategyId);
      if (!r.ok) return fail(r.error);
      toast.success(t("deleted"));
      router.refresh();
    });
  }

  const allTasks = doc.milestones.flatMap((m) => m.tasks);
  const doneTasks = allTasks.filter((x) => x.status === "done").length;

  return (
    <div className="space-y-4 pb-20">
      {/* Barra de acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {props.source === "ai" && <AiBadge />}
          <span>{t("updated", { date: format.dateTime(new Date(props.updatedAt), { dateStyle: "medium", timeStyle: "short" }) })}</span>
          {ro && <span className="rounded-sm border border-border px-1.5 py-px">{t("readOnlyBadge")}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PlannerDialog
            projectId={projectId}
            strategyId={strategyId}
            canEdit={canEdit}
            dirty={dirty}
            aiReady={props.aiReady}
            balance={props.balance}
            hasActiveAccounts={props.hasActiveAccounts}
            hasPillars={props.initial.pillars.length > 0}
          />
          {canEdit && (
            <RegenerateDialog projectId={projectId} accountId={props.accountId} aiReady={props.aiReady} balance={props.balance} onError={fail} />
          )}
        </div>
      </div>

      {/* Resumen */}
      <Card>
        <CardHeader>
          <CardTitle className="label-mono">{t("sections.summary")}</CardTitle>
          <CardDescription>{props.scopeLabel}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="s-title">{t("fields.title")}</Label>
            <Input id="s-title" value={doc.title} onChange={(e) => set("title", e.target.value)} maxLength={120} disabled={ro} placeholder={t("fields.titlePlaceholder")} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-summary">{t("fields.summary")}</Label>
              <Textarea id="s-summary" value={doc.summary} onChange={(e) => set("summary", e.target.value)} maxLength={2000} rows={4} disabled={ro} placeholder={t("fields.summaryPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-audience">{t("fields.audience")}</Label>
              <Textarea id="s-audience" value={doc.audience} onChange={(e) => set("audience", e.target.value)} maxLength={2000} rows={4} disabled={ro} placeholder={t("fields.audiencePlaceholder")} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pilares */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="label-mono">{t("sections.pillars")}</CardTitle>
            <CardDescription>{t("pillars.help")}</CardDescription>
          </div>
          {doc.pillars.length > 0 && (
            <span className={cn("font-mono text-xs tabular-nums", shareTotal === 100 ? "text-muted-foreground" : "text-warning")} aria-live="polite">
              {t("pillars.total", { total: shareTotal })}
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {doc.pillars.length === 0 && <p className="text-sm text-muted-foreground">{t("pillars.empty")}</p>}
          {doc.pillars.map((p, i) => (
            <div key={p.id} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-start gap-2">
                <span className="mt-1.5 font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_96px]">
                  <Input aria-label={t("pillars.name")} value={p.name} maxLength={80} disabled={ro} placeholder={t("pillars.name")}
                    onChange={(e) => set("pillars", doc.pillars.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <div className="flex items-center gap-1">
                    <Input aria-label={t("pillars.share")} type="number" min={0} max={100} value={p.share} disabled={ro} className="font-mono tabular-nums"
                      onChange={(e) => set("pillars", doc.pillars.map((x, j) => (j === i ? { ...x, share: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } : x)))} />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                {!ro && <RowActions index={i} count={doc.pillars.length} label={p.name || t("pillars.name")} onMove={(dir) => set("pillars", move(doc.pillars, i, dir))} onRemove={() => set("pillars", doc.pillars.filter((_, j) => j !== i))} />}
              </div>
              <Textarea aria-label={t("pillars.description")} value={p.description} maxLength={500} rows={2} disabled={ro} placeholder={t("pillars.description")}
                onChange={(e) => set("pillars", doc.pillars.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground" htmlFor={`ex-${p.id}`}>{t("pillars.examples")}</Label>
                <Textarea id={`ex-${p.id}`} value={p.examples.join("\n")} rows={2} disabled={ro}
                  onChange={(e) => set("pillars", doc.pillars.map((x, j) => (j === i ? { ...x, examples: e.target.value.split("\n").map((s) => s.slice(0, 200)).slice(0, 8) } : x)))} />
              </div>
            </div>
          ))}
          {!ro && doc.pillars.length < 12 && (
            <Button type="button" variant="outline" size="sm" onClick={() => set("pillars", [...doc.pillars, { id: crypto.randomUUID(), name: "", description: "", examples: [], share: 0 }])}>
              <Plus /> {t("pillars.add")}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Frecuencia y objetivos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="label-mono">{t("sections.frequency")}</CardTitle>
            <CardDescription>{t("frequency.help")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {doc.frequency.length === 0 && <p className="text-sm text-muted-foreground">{t("frequency.empty")}</p>}
            {doc.frequency.map((f, i) => (
              <div key={f.platform} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                <PlatformIcon platform={f.platform} className="size-6 text-[9px]" />
                <span className="min-w-20 text-sm">{PLATFORM_NAME[f.platform]}</span>
                <Input aria-label={t("frequency.perWeek", { platform: PLATFORM_NAME[f.platform] })} type="number" min={0} max={21} value={f.postsPerWeek} disabled={ro} className="w-16 font-mono tabular-nums"
                  onChange={(e) => set("frequency", doc.frequency.map((x, j) => (j === i ? { ...x, postsPerWeek: Math.max(0, Math.min(21, Number(e.target.value) || 0)) } : x)))} />
                <span className="text-xs text-muted-foreground">{t("frequency.unit")}</span>
                <NativeSelect aria-label={t("frequency.hour", { platform: PLATFORM_NAME[f.platform] })} value={f.hour} disabled={ro} className="font-mono"
                  onChange={(e) => set("frequency", doc.frequency.map((x, j) => (j === i ? { ...x, hour: Number(e.target.value) } : x)))}>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>
                  ))}
                </NativeSelect>
                {!ro && (
                  <Button type="button" variant="ghost" size="icon-sm" className="ml-auto text-muted-foreground hover:text-destructive" aria-label={t("common.remove", { item: PLATFORM_NAME[f.platform] })}
                    onClick={() => set("frequency", doc.frequency.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                )}
                {f.postsPerWeek > 7 && <p className="flex w-full items-center gap-1 text-xs text-warning"><AlertTriangle className="size-3.5" aria-hidden /> {t("frequency.high")}</p>}
              </div>
            ))}
            {!ro && usedPlatforms.size < PLATFORMS.length && (
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.filter((p) => !usedPlatforms.has(p)).map((p) => (
                  <Button key={p} type="button" variant="outline" size="sm" onClick={() => set("frequency", [...doc.frequency, defaultFrequency(p)])}>
                    <Plus /> {PLATFORM_NAME[p]}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="label-mono">{t("sections.objectives")}</CardTitle>
            <CardDescription>{t("objectives.help")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {doc.objectives.length === 0 && <p className="text-sm text-muted-foreground">{t("objectives.empty")}</p>}
            {doc.objectives.map((o, i) => (
              <div key={o.id} className="space-y-2 rounded-md border border-border p-2">
                <div className="flex items-center gap-2">
                  <Input aria-label={t("objectives.objective")} value={o.objective} maxLength={200} disabled={ro} placeholder={t("objectives.objective")}
                    onChange={(e) => set("objectives", doc.objectives.map((x, j) => (j === i ? { ...x, objective: e.target.value } : x)))} />
                  {!ro && <RowActions index={i} count={doc.objectives.length} label={o.objective || t("objectives.objective")} onMove={(dir) => set("objectives", move(doc.objectives, i, dir))} onRemove={() => set("objectives", doc.objectives.filter((_, j) => j !== i))} />}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_96px_140px]">
                  <Input aria-label={t("objectives.kpi")} value={o.kpi} maxLength={120} disabled={ro} placeholder={t("objectives.kpi")} className="col-span-2 sm:col-span-1"
                    onChange={(e) => set("objectives", doc.objectives.map((x, j) => (j === i ? { ...x, kpi: e.target.value } : x)))} />
                  <Input aria-label={t("objectives.target")} value={o.target} maxLength={60} disabled={ro} placeholder={t("objectives.target")} className="font-mono"
                    onChange={(e) => set("objectives", doc.objectives.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))} />
                  <Input aria-label={t("objectives.deadline")} type="date" value={o.deadline ?? ""} disabled={ro} className="font-mono"
                    onChange={(e) => set("objectives", doc.objectives.map((x, j) => (j === i ? { ...x, deadline: e.target.value || null } : x)))} />
                </div>
              </div>
            ))}
            {!ro && doc.objectives.length < 20 && (
              <Button type="button" variant="outline" size="sm" onClick={() => set("objectives", [...doc.objectives, { id: crypto.randomUUID(), objective: "", kpi: "", target: "", deadline: null }])}>
                <Plus /> {t("objectives.add")}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Roadmap */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="label-mono">{t("sections.roadmap")}</CardTitle>
            <CardDescription>{t("roadmap.help")}</CardDescription>
          </div>
          {allTasks.length > 0 && (
            <div className="w-40 space-y-1">
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{t("roadmap.progress", { done: doneTasks, total: allTasks.length })}</span>
              <ProgressBar value={(doneTasks / allTasks.length) * 100} label={t("roadmap.progressLabel")} />
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {doc.milestones.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border py-8 text-center">
              <Flag className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              <p className="text-sm text-muted-foreground">{t("roadmap.empty")}</p>
            </div>
          )}
          <ol className="space-y-4">
            {doc.milestones.map((m, mi) => {
              const mDone = m.tasks.filter((x) => x.status === "done").length;
              return (
                <li key={m.id} className="relative rounded-md border border-border p-3 sm:pl-5">
                  <span aria-hidden className="absolute top-3 bottom-3 left-0 hidden w-0.5 rounded-full bg-primary-ink/40 sm:block" />
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_150px]">
                      <Input aria-label={t("roadmap.milestone")} value={m.title} maxLength={160} disabled={ro} placeholder={t("roadmap.milestone")} className="font-medium"
                        onChange={(e) => setMilestone(mi, { title: e.target.value })} />
                      <Input aria-label={t("roadmap.milestoneDate")} type="date" value={m.dueDate ?? ""} disabled={ro} className="font-mono"
                        onChange={(e) => setMilestone(mi, { dueDate: e.target.value || null })} />
                    </div>
                    {!ro && <RowActions index={mi} count={doc.milestones.length} label={m.title || t("roadmap.milestone")} onMove={(dir) => set("milestones", move(doc.milestones, mi, dir))} onRemove={() => set("milestones", doc.milestones.filter((_, j) => j !== mi))} />}
                  </div>
                  <Textarea aria-label={t("roadmap.milestoneDescription")} value={m.description} maxLength={1000} rows={1} disabled={ro} placeholder={t("roadmap.milestoneDescription")} className="mt-2 min-h-9"
                    onChange={(e) => setMilestone(mi, { description: e.target.value })} />
                  <p className="mt-2 font-mono text-xs tabular-nums text-muted-foreground">{t("roadmap.progress", { done: mDone, total: m.tasks.length })}</p>

                  <ul className="mt-2 space-y-2">
                    {m.tasks.map((task, ti) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        index={ti}
                        count={m.tasks.length}
                        ro={ro}
                        dirty={dirty}
                        pending={pending}
                        people={props.people}
                        postStatus={task.postId ? props.postStatus[task.postId] : undefined}
                        projectId={projectId}
                        onChange={(patch) => setTask(mi, ti, patch)}
                        onMove={(dir) => setMilestone(mi, { tasks: move(m.tasks, ti, dir) })}
                        onRemove={() => setMilestone(mi, { tasks: m.tasks.filter((_, j) => j !== ti) })}
                        onToCalendar={() => toCalendar(task.id)}
                      />
                    ))}
                  </ul>
                  {!ro && m.tasks.length < 40 && (
                    <Button type="button" variant="ghost" size="sm" className="mt-2"
                      onClick={() => setMilestone(mi, { tasks: [...m.tasks, { id: crypto.randomUUID(), title: "", brief: "", platform: null, status: "todo", assigneeId: null, dueDate: m.dueDate, postId: null }] })}>
                      <Plus /> {t("roadmap.addTask")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
          {!ro && doc.milestones.length < 20 && (
            <Button type="button" variant="outline" size="sm" onClick={() => set("milestones", [...doc.milestones, { id: crypto.randomUUID(), title: "", description: "", dueDate: null, tasks: [] }])}>
              <Plus /> {t("roadmap.addMilestone")}
            </Button>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={pending}>
                <Trash2 /> {t("delete")}
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

      {/* Barra de guardado fija */}
      {canEdit && dirty && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4" role="region" aria-label={t("unsaved")}>
          <div className="surface flex w-full max-w-xl flex-wrap items-center justify-between gap-2 rounded-lg bg-card/95 p-2 pl-4 shadow-lg backdrop-blur animate-rise">
            <span className="text-sm">{t("unsaved")}</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDoc(props.initial)} disabled={pending}>
                <RotateCcw /> {t("discard")}
              </Button>
              <Button size="sm" onClick={save} disabled={pending}>
                <Save /> {pending ? t("saving") : t("save")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow(props: {
  task: RoadmapTask;
  index: number;
  count: number;
  ro: boolean;
  dirty: boolean;
  pending: boolean;
  people: { id: string; name: string }[];
  postStatus?: string;
  projectId: string;
  onChange: (patch: Partial<RoadmapTask>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onToCalendar: () => void;
}) {
  const { task, ro } = props;
  const t = useTranslations("strategy");
  const tp = useTranslations("posts.status");
  const [open, setOpen] = useState(!task.title);
  const done = task.status === "done";
  return (
    <li className={cn("rounded-md border border-border bg-background/40 p-2", done && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label={t("roadmap.status")} value={task.status} disabled={ro} onChange={(e) => props.onChange({ status: e.target.value as RoadmapTask["status"] })}
          className={cn("w-28", task.status === "done" && "text-success", task.status === "doing" && "text-info")}>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>{t(`roadmap.statuses.${s}`)}</option>
          ))}
        </NativeSelect>
        <Input aria-label={t("roadmap.task")} value={task.title} maxLength={200} disabled={ro} placeholder={t("roadmap.task")} className={cn("min-w-40 flex-1", done && "line-through")}
          onChange={(e) => props.onChange({ title: e.target.value })} />
        <Button type="button" variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? t("roadmap.less") : t("roadmap.more")}
        </Button>
        {!ro && <RowActions index={props.index} count={props.count} label={task.title || t("roadmap.task")} onMove={props.onMove} onRemove={props.onRemove} />}
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <Textarea aria-label={t("roadmap.brief")} value={task.brief} maxLength={2000} rows={2} disabled={ro} placeholder={t("roadmap.briefPlaceholder")}
            onChange={(e) => props.onChange({ brief: e.target.value })} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>{t("roadmap.platform")}</span>
              <NativeSelect value={task.platform ?? ""} disabled={ro} className="w-full" onChange={(e) => props.onChange({ platform: (e.target.value || null) as Platform | null })}>
                <option value="">{t("roadmap.noPlatform")}</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{PLATFORM_NAME[p]}</option>
                ))}
              </NativeSelect>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>{t("roadmap.assignee")}</span>
              <NativeSelect value={task.assigneeId ?? ""} disabled={ro} className="w-full" onChange={(e) => props.onChange({ assigneeId: e.target.value || null })}>
                <option value="">{t("roadmap.unassigned")}</option>
                {props.people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </NativeSelect>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>{t("roadmap.dueDate")}</span>
              <Input type="date" value={task.dueDate ?? ""} disabled={ro} className="font-mono" onChange={(e) => props.onChange({ dueDate: e.target.value || null })} />
            </label>
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {task.platform && <PlatformIcon platform={task.platform} className="size-5 text-[8px]" />}
        {task.postId ? (
          <Link href={`/app/p/${props.projectId}/posts/${task.postId}`} className="link inline-flex items-center gap-1">
            <ExternalLink className="size-3.5" aria-hidden /> {t("roadmap.openDraft")}
            {props.postStatus && <span className="text-muted-foreground">· {tp.has(props.postStatus) ? tp(props.postStatus) : props.postStatus}</span>}
          </Link>
        ) : (
          !ro && (
            <Button type="button" variant="outline" size="xs" disabled={props.pending || props.dirty || !task.title.trim()} onClick={props.onToCalendar}
              title={props.dirty ? t("roadmap.saveFirst") : undefined}>
              <CalendarPlus /> {t("roadmap.toCalendar")}
            </Button>
          )
        )}
        {!task.postId && !ro && props.dirty && <span className="text-muted-foreground">{t("roadmap.saveFirst")}</span>}
      </div>
    </li>
  );
}

function RegenerateDialog({ projectId, accountId, aiReady, balance, onError }: { projectId: string; accountId: string | null; aiReady: boolean; balance: number; onError: (e: string) => void }) {
  const t = useTranslations("strategy");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  function run(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await aiGenerateStrategy({ projectId, accountId, goal, notes, tzOffset: new Date().getTimezoneOffset(), idempotencyKey: crypto.randomUUID() });
      if (!r.ok) return onError(r.error);
      toast.success(t("ai.done"));
      setOpen(false);
      router.refresh();
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles className="text-brand-amber-ink" /> {t("ai.regenerate")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("ai.regenerate")}</DialogTitle>
          <DialogDescription>{t("ai.regenerateBody")}</DialogDescription>
        </DialogHeader>
        {aiReady ? (
          <form onSubmit={run} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rg-goal">{t("ai.goal")}</Label>
              <Input id="rg-goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={t("ai.goalPlaceholder")} minLength={3} maxLength={300} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rg-notes">{t("ai.notes")}</Label>
              <Textarea id="rg-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} />
            </div>
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t("ai.replaceWarning")}
            </p>
            <DialogFooter className="items-center gap-3">
              <Cost credits={CREDITS.strategy} balance={balance} />
              <Button type="submit" variant="brand" disabled={pending || goal.trim().length < 3 || balance < CREDITS.strategy}>
                <Sparkles /> {pending ? t("ai.generating") : t("ai.generate")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">{t("ai.notConfigured")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
