"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, CalendarRange, Info, Plug, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { hasCrossAccountDuplicates, type PlannedSlot } from "@/lib/strategy/planner";
import { CREDITS } from "@/lib/strategy/schema";
import { Cost } from "./_components/cost";
import { createPlannedDrafts, previewPlan } from "./actions";
import { aiWritePlanDrafts } from "./ai-actions";

type Row = PlannedSlot & { include: boolean; ai: boolean };

export function PlannerDialog(props: {
  projectId: string;
  strategyId: string;
  canEdit: boolean;
  dirty: boolean;
  aiReady: boolean;
  balance: number;
  hasActiveAccounts: boolean;
  hasPillars: boolean;
}) {
  const t = useTranslations("strategy.planner");
  const te = useTranslations("strategy.errors");
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [skipped, setSkipped] = useState<{ accountId: string; count: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tz = () => new Date().getTimezoneOffset();

  const fail = (e: string) => {
    toast.error(te.has(e) ? te(e) : te("generic"));
  };

  function load() {
    setRows(null);
    setError(null);
    start(async () => {
      const r = await previewPlan({ projectId: props.projectId, strategyId: props.strategyId, tzOffset: tz() });
      if (!r.ok) return setError(r.error);
      setRows(r.data.slots.map((s) => ({ ...s, include: true, ai: false })));
      setSkipped(r.data.skipped);
    });
  }

  const included = useMemo(() => (rows ?? []).filter((r) => r.include), [rows]);
  const duplicates = useMemo(() => hasCrossAccountDuplicates(included), [included]);
  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows ?? []) m.set(r.localDay, [...(m.get(r.localDay) ?? []), r]);
    return [...m.entries()];
  }, [rows]);
  const handleOf = (accountId: string) => {
    const r = rows?.find((x) => x.accountId === accountId);
    return r?.handle ? `@${r.handle.replace(/^@/, "")}` : (r?.platform ?? "");
  };

  function writeWithAi() {
    if (!rows) return;
    start(async () => {
      const r = await aiWritePlanDrafts({
        projectId: props.projectId,
        idempotencyKey: crypto.randomUUID(),
        slots: included.map((s) => ({ key: s.key, accountId: s.accountId, platform: s.platform, account: (s.handle ?? s.platform).slice(0, 80), pillar: s.pillarName, idea: s.idea, day: s.localDay })),
      });
      if (!r.ok) return fail(r.error);
      const byKey = new Map(r.data.map((d) => [d.key, d]));
      // Fusionar uno a uno: si una propuesta repite el texto de otra cuenta, se queda la de plantilla.
      const next: Row[] = [];
      for (const row of rows) {
        const d = byKey.get(row.key);
        const candidate = d ? { ...row, caption: d.caption, title: d.title || row.title, ai: true } : row;
        next.push(hasCrossAccountDuplicates([...next, candidate].filter((x) => x.include)) ? row : candidate);
      }
      setRows(next);
      toast.success(t("aiDone"));
    });
  }

  function create() {
    start(async () => {
      const r = await createPlannedDrafts({
        projectId: props.projectId,
        strategyId: props.strategyId,
        tzOffset: tz(),
        slots: included.map((s) => ({ accountId: s.accountId, scheduledAt: s.scheduledAt, title: s.title, caption: s.caption })),
      });
      if (!r.ok) return fail(r.error);
      toast.success(t("created", { count: r.data.created }), {
        action: { label: t("openCalendar"), onClick: () => router.push(`/app/p/${props.projectId}/calendar?view=list`) },
      });
      setOpen(false);
      router.refresh();
    });
  }

  const disabledReason = !props.canEdit ? null : props.dirty ? t("saveFirst") : !props.hasPillars ? te("no_pillars") : null;

  return (
    <>
      <div className="flex flex-col items-end gap-0.5">
        <Button
          size="sm"
          disabled={!props.canEdit || props.dirty || !props.hasPillars}
          onClick={() => {
            setOpen(true);
            load();
          }}
        >
          <CalendarRange /> {t("open")}
        </Button>
        {disabledReason && <span className="text-[11px] text-muted-foreground">{disabledReason}</span>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] grid-rows-[auto_1fr_auto] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("body")}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
            {pending && !rows && !error && (
              <div className="space-y-2" aria-busy="true">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            )}
            {error === "no_accounts" && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Plug className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                <p className="text-sm text-muted-foreground">{te("no_accounts")}</p>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/p/${props.projectId}/accounts`}>{t("connect")}</Link>
                </Button>
              </div>
            )}
            {error && error !== "no_accounts" && <p className="text-sm text-destructive">{te.has(error) ? te(error) : te("generic")}</p>}

            {rows && rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("nothing")}</p>}

            {rows && rows.length > 0 && (
              <>
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t("limitsNote")}
                </p>
                {skipped.length > 0 && (
                  <p className="flex items-start gap-1.5 text-xs text-warning" role="status">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {skipped.map((s) => t("skipped", { count: s.count, account: handleOf(s.accountId) })).join(" · ")}
                  </p>
                )}
                {byDay.map(([day, list]) => (
                  <section key={day} aria-label={day} className="space-y-2">
                    <h3 className="label-mono">{format.dateTime(new Date(`${day}T12:00:00`), { weekday: "long", day: "numeric", month: "short" })}</h3>
                    {list.map((r) => (
                      <div key={r.key} className="rounded-md border border-border p-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={r.include}
                            aria-label={t("include", { title: r.title })}
                            onCheckedChange={(v) => setRows((rs) => rs!.map((x) => (x.key === r.key ? { ...x, include: v === true } : x)))}
                          />
                          <PlatformIcon platform={r.platform} className="size-6 text-[9px]" />
                          <span className="font-mono text-xs tabular-nums">{format.dateTime(new Date(r.scheduledAt), { hour: "2-digit", minute: "2-digit" })}</span>
                          <span className="truncate text-xs text-muted-foreground">{handleOf(r.accountId)}</span>
                          <span className="ml-auto shrink-0 rounded-sm border border-border px-1.5 py-px text-[11px] text-muted-foreground">{r.pillarName}</span>
                        </div>
                        <p className="mt-1 text-sm font-medium">{r.title}</p>
                        <Textarea
                          aria-label={t("caption", { title: r.title })}
                          value={r.caption}
                          maxLength={2200}
                          rows={3}
                          disabled={!r.include}
                          className="mt-1 text-xs"
                          onChange={(e) => setRows((rs) => rs!.map((x) => (x.key === r.key ? { ...x, caption: e.target.value } : x)))}
                        />
                      </div>
                    ))}
                  </section>
                ))}
              </>
            )}
          </div>

          {rows && rows.length > 0 && (
            <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col">
              {duplicates && (
                <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
                  <AlertTriangle className="size-3.5" aria-hidden /> {te("duplicate_text")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{t("draftsOnly")}</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {props.aiReady ? (
                  <span className="flex items-center gap-2">
                    <Button variant="brand" size="sm" onClick={writeWithAi} disabled={pending || !included.length || props.balance < CREDITS.planner}>
                      <Sparkles /> {t("aiWrite")}
                    </Button>
                    <Cost credits={CREDITS.planner} balance={props.balance} />
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">{t("aiNotConfigured")}</span>
                )}
                <Button onClick={create} disabled={pending || !included.length || duplicates}>
                  {t("create", { count: included.length })}
                </Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
