"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, ListTodo, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { acceptAgendaPlan } from "@/app/app/(shell)/agenda/actions";
import { TerminalCursor } from "@/components/brand/terminal-cursor";
import { ProjectDot } from "@/components/dashboard/project-dot";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { planTime, proposalToMinutes, type FreeSlot } from "@/lib/agenda/core";
import type { PlanCandidate } from "@/lib/agenda/server";
import { cn } from "@/lib/utils";
import { dayDate, useDuration } from "./format";

/**
 * «Planificar mi día/semana»: propone dónde hacer las tareas pendientes y preparar los borradores próximos.
 * Es una PROPUESTA: el usuario quita elementos, cambia duraciones y solo se guarda al pulsar «Aceptar».
 */
export function PlanDialog({
  open,
  onClose,
  scope,
  candidates,
  slots,
  timezone,
  projectColor,
  available,
}: {
  open: boolean;
  onClose: () => void;
  scope: "day" | "week";
  candidates: PlanCandidate[];
  slots: FreeSlot[];
  timezone: string;
  projectColor: (projectId: string | null) => number;
  available: boolean;
}) {
  const t = useTranslations("agenda.plan");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{scope === "day" ? t("titleDay") : t("titleWeek")}</DialogTitle>
          <DialogDescription>{t("intro")}</DialogDescription>
        </DialogHeader>
        {open && <PlanBody onClose={onClose} candidates={candidates} slots={slots} timezone={timezone} projectColor={projectColor} available={available} />}
      </DialogContent>
    </Dialog>
  );
}

function PlanBody({
  onClose,
  candidates,
  slots,
  timezone,
  projectColor,
  available,
}: {
  onClose: () => void;
  candidates: PlanCandidate[];
  slots: FreeSlot[];
  timezone: string;
  projectColor: (projectId: string | null) => number;
  available: boolean;
}) {
  const t = useTranslations("agenda.plan");
  const format = useFormatter();
  const duration = useDuration();
  const [pending, start] = useTransition();
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [minutes, setMinutes] = useState<Record<string, number>>(() => Object.fromEntries(candidates.map((c) => [c.id, c.minutes])));

  const items = useMemo(() => candidates.filter((c) => !excluded.has(c.id)).map((c) => ({ ...c, minutes: minutes[c.id] ?? c.minutes })), [candidates, excluded, minutes]);
  const { proposals, unplaced } = useMemo(() => planTime({ items, slots, timezone }), [items, slots, timezone]);
  const byItem = new Map(proposals.map((p) => [p.itemId, p]));
  const order = [...proposals.map((p) => p.itemId), ...unplaced, ...candidates.filter((c) => excluded.has(c.id)).map((c) => c.id)];
  const cand = new Map(candidates.map((c) => [c.id, c]));
  const freeTotal = slots.reduce((a, s) => a + s.minutes, 0);

  const fmtDay = (day: string) => format.dateTime(dayDate(day), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  const accept = () => {
    const blocks = proposals.map((p) => {
      const c = cand.get(p.itemId)!;
      const m = proposalToMinutes(p, timezone);
      return {
        title: (c.type === "post" ? t("preparePrefix", { title: c.title }) : c.title).slice(0, 120),
        day: p.day,
        startMinute: m.startMinute,
        endMinute: m.endMinute,
        projectId: c.projectId,
        taskId: c.taskId ?? null,
        postId: c.postId ?? null,
      };
    });
    if (!blocks.length) return;
    start(async () => {
      const res = await acceptAgendaPlan(blocks);
      if (res.ok) {
        toast.success(t("saved", { count: res.count ?? blocks.length }));
        onClose();
      } else toast.error(t(`error_${res.error}`));
    });
  };

  if (!candidates.length) {
    return (
      <>
        <div className="bg-dots flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
          <ListTodo className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          <p className="max-w-sm text-sm text-muted-foreground">{t("empty")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("close")}
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <div className="-mx-4 min-h-0 overflow-y-auto px-4">
        <p className="mb-3 text-xs text-muted-foreground">
          {freeTotal ? t("freeAvailable", { time: duration(freeTotal) }) : t("noFree")}
        </p>
        <ul className="divide-y rounded-lg border" aria-label={t("listLabel")}>
          {order.map((id) => {
            const c = cand.get(id)!;
            const p = byItem.get(id);
            const off = excluded.has(id);
            const inputId = `min-${id}`;
            return (
              <li key={id} className={cn("grid gap-2 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center", off && "opacity-60")}>
                <label className="flex min-h-9 items-start gap-2.5 sm:col-span-2 pointer-coarse:min-h-11">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-[var(--selected)]"
                    checked={!off}
                    onChange={(e) =>
                      setExcluded((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {c.type === "post" ? <Send className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : <ListTodo className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                      <span className="truncate">{c.type === "post" ? t("preparePrefix", { title: c.title }) : c.title}</span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      {c.projectName && (
                        <span className="inline-flex items-center gap-1.5">
                          <ProjectDot index={projectColor(c.projectId)} />
                          {c.projectName}
                        </span>
                      )}
                      <span>· {c.type === "post" ? t("typePost") : t("typeTask")}</span>
                      <span>· {c.due ? (c.type === "post" ? t("postDue", { date: fmtDay(c.due) }) : t("due", { date: fmtDay(c.due) })) : t("noDue")}</span>
                    </span>
                  </span>
                </label>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6.5 sm:col-start-3 sm:row-start-1 sm:justify-end sm:pl-0">
                  <label htmlFor={inputId} className="sr-only">
                    {t("durationFor", { title: c.title })}
                  </label>
                  <span className="inline-flex items-center gap-1">
                    <input
                      id={inputId}
                      type="number"
                      inputMode="numeric"
                      min={5}
                      max={480}
                      step={5}
                      disabled={off}
                      value={minutes[id] ?? c.minutes}
                      onChange={(e) => {
                        const v = Math.max(5, Math.min(480, Number(e.target.value) || 5));
                        setMinutes((prev) => ({ ...prev, [id]: v }));
                      }}
                      className="h-9 w-16 rounded-md border border-input bg-transparent px-2 text-right font-mono text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-black/20 pointer-coarse:h-11"
                    />
                    <span className="text-xs text-muted-foreground">{t("min")}</span>
                  </span>
                  <span className="min-w-36 font-mono text-xs tabular-nums sm:text-right">
                    {off ? (
                      <span className="text-muted-foreground">{t("excluded")}</span>
                    ) : p ? (
                      <span className={cn("inline-flex items-center gap-1", p.late ? "text-warning" : "text-foreground")}>
                        {p.late && <AlertTriangle className="size-3" aria-hidden />}
                        {t("willGo", { date: fmtDay(p.day), start: p.startTime, end: p.endTime })}
                        {p.late && <span className="sr-only">{t("late")}</span>}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t("noFit")}</span>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        {proposals.some((p) => p.late) && <p className="mt-2 text-xs text-warning">{t("lateNote")}</p>}
      </div>
      <DialogFooter className="sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" aria-hidden /> {t("proposalNote")}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="ghost" onClick={onClose}>
            {t("discard")}
          </Button>
          <Button onClick={accept} disabled={pending || !available || proposals.length === 0} aria-busy={pending}>
            {pending && <TerminalCursor />}
            {t("accept", { count: proposals.length })}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
