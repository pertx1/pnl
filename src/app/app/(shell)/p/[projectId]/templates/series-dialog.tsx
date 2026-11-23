"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, CalendarClock, Clock, Info, Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SERIES_MAX, SERIES_TZ, type Weekday } from "@/lib/posts/series";
import { extractPlaceholders } from "@/lib/posts/templates";
import type { TemplateDTO } from "@/lib/server/templates";
import { cn } from "@/lib/utils";
import { createSeries, previewSeries, type SeriesInput, type SeriesPreview } from "./actions";

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** Fecha local YYYY-MM-DD de mañana en Madrid (solo en manejadores de eventos, nunca en el render). */
function tomorrowInMadrid() {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: SERIES_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date(Date.now() + 86_400_000));
}

export type SeriesDefaults = { startDate: string };
export const seriesDefaults = (): SeriesDefaults => ({ startDate: tomorrowInMadrid() });

/**
 * Programar una serie a partir de una plantilla: recurrencia semanal (días, hora de Madrid, cada N semanas, nº de
 * publicaciones), valores para los huecos y modo (borradores o pendientes). Vista previa calculada en el servidor
 * con el límite diario por cuenta. NUNCA aprueba ni publica.
 */
export function SeriesDialog({ projectId, template, defaults, onClose }: { projectId: string; template: TemplateDTO; defaults: SeriesDefaults; onClose: () => void }) {
  const t = useTranslations("templates.series");
  const te = useTranslations("templates.errors");
  const format = useFormatter();
  const router = useRouter();
  const uid = useId();
  const holes = extractPlaceholders(template.title, template.caption, template.options.youtube?.yt_title);

  const [name, setName] = useState(template.name);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [time, setTime] = useState(template.preferredTime ?? "18:00");
  const [weekdays, setWeekdays] = useState<Weekday[]>([1]);
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [count, setCount] = useState(8);
  const [values, setValues] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"draft" | "pending">("draft");
  const [preview, setPreview] = useState<SeriesPreview | null>(null);
  const [pending, start] = useTransition();

  const input = (): SeriesInput => ({
    projectId,
    templateId: template.id,
    name,
    recurrence: { startDate, weekdays, time, count, intervalWeeks },
    values: Object.fromEntries(
      Object.entries(values).map(([k, v]) => [
        k,
        v
          .split("\n")
          .map((x) => x.trim())
          .slice(0, SERIES_MAX),
      ]),
    ),
    mode,
  });
  const valid = name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{2}:\d{2}$/.test(time) && weekdays.length > 0 && count >= 1 && count <= SERIES_MAX;
  const ok = preview?.items.filter((i) => !i.blocked.length) ?? [];
  const willBePending = mode === "pending" ? ok.filter((i) => !i.issues.length).length : 0;

  const fail = (e: string) => {
    toast.error(te.has(e) ? te(e) : te("generic"));
  };
  // Cualquier cambio invalida la vista previa (hay que volver a calcularla antes de crear).
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPreview(null);
  };

  function loadPreview() {
    start(async () => {
      const r = await previewSeries(input());
      if (!r.ok) return fail(r.error);
      setPreview(r.data);
    });
  }

  function create() {
    start(async () => {
      const r = await createSeries(input());
      if (!r.ok) return fail(r.error);
      toast.success(t("created", { count: r.data.created, pending: r.data.pending }), {
        action: { label: t("openCalendar"), onClick: () => router.push(`/app/p/${projectId}/calendar?view=list`) },
      });
      onClose();
      router.refresh();
    });
  }

  const fmt = (iso: string) => format.dateTime(new Date(iso), { weekday: "short", day: "numeric", month: "short", timeZone: SERIES_TZ });
  const fmtTime = (iso: string) => format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone: SERIES_TZ });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] grid-rows-[auto_1fr_auto] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title", { name: template.name })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
          <p className="rounded-md border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">{t("approvalNote")}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`${uid}-name`}>{t("name")}</Label>
              <Input id={`${uid}-name`} value={name} maxLength={80} required onChange={(e) => edit(setName)(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${uid}-start`}>{t("start")}</Label>
              <Input id={`${uid}-start`} type="date" value={startDate} required onChange={(e) => edit(setStartDate)(e.target.value)} className="font-mono tabular-nums" />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${uid}-time`}>{t("time")}</Label>
              <Input id={`${uid}-time`} type="time" value={time} required onChange={(e) => edit(setTime)(e.target.value)} className="font-mono tabular-nums" aria-describedby={`${uid}-tz`} />
            </div>
          </div>
          <p id={`${uid}-tz`} className="-mt-2 text-xs text-muted-foreground">
            {t("tz")}
          </p>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("weekdays")}</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const on = weekdays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    aria-label={t(`weekdayLong.${d}`)}
                    onClick={() => edit(setWeekdays)(on ? weekdays.filter((x) => x !== d) : [...weekdays, d].sort())}
                    className={cn(
                      "grid size-11 place-items-center rounded-full border font-mono text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      on ? "border-selected bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:border-border-strong hover:text-foreground",
                    )}
                  >
                    {t(`weekdayShort.${d}`)}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["mwf", [1, 3, 5]],
                  ["weekdaysOnly", [1, 2, 3, 4, 5]],
                  ["everyDay", [1, 2, 3, 4, 5, 6, 7]],
                ] as const
              ).map(([k, days]) => (
                <Button key={k} type="button" size="xs" variant="ghost" onClick={() => edit(setWeekdays)([...days])}>
                  {t(`preset.${k}`)}
                </Button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${uid}-interval`}>{t("interval")}</Label>
              <select
                id={`${uid}-interval`}
                value={intervalWeeks}
                onChange={(e) => edit(setIntervalWeeks)(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {t("everyWeeks", { count: n })}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${uid}-count`}>{t("count")}</Label>
              <Input
                id={`${uid}-count`}
                type="number"
                inputMode="numeric"
                min={1}
                max={SERIES_MAX}
                value={count}
                onChange={(e) => edit(setCount)(Math.max(1, Math.min(SERIES_MAX, Math.trunc(Number(e.target.value) || 1))))}
                className="w-28 font-mono tabular-nums"
              />
            </div>
          </div>

          {holes.length > 0 && (
            <div className="space-y-3">
              {holes.map((h) => (
                <div key={h} className="space-y-1">
                  <Label htmlFor={`${uid}-v-${h}`}>
                    {t("values")} <code className="rounded-sm bg-secondary px-1 font-mono text-xs">{`{${h}}`}</code>
                  </Label>
                  <Textarea
                    id={`${uid}-v-${h}`}
                    rows={3}
                    value={values[h] ?? ""}
                    aria-describedby={`${uid}-v-hint`}
                    onChange={(e) => edit(setValues)({ ...values, [h]: e.target.value })}
                  />
                </div>
              ))}
              <p id={`${uid}-v-hint`} className="text-xs text-muted-foreground">
                {t("valuesHint")}
              </p>
            </div>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("mode")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["draft", "pending"] as const).map((m) => (
                <label key={m} className={cn("flex cursor-pointer gap-3 rounded-md border p-3 text-sm", mode === m && "border-selected bg-secondary/60")}>
                  <input type="radio" name={`${uid}-mode`} value={m} checked={mode === m} onChange={() => edit(setMode)(m)} className="mt-0.5 size-4 accent-[var(--selected)]" />
                  <span>
                    <span className="font-medium">{m === "draft" ? t("modeDraft") : t("modePending")}</span>
                    <span className="block text-xs text-muted-foreground">{m === "draft" ? t("modeDraftHint") : t("modePendingHint")}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Vista previa calculada en el servidor */}
          <section aria-live="polite" aria-busy={pending} className="space-y-2">
            {pending && !preview && (
              <div className="space-y-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            )}
            {preview && (
              <>
                <h3 className="label-mono">{t("summary", { ok: ok.length, total: preview.items.length })}</h3>
                {preview.accounts.length === 0 && <p className="text-xs text-warning">{t("noAccountsWarn")}</p>}
                {preview.skippedPast > 0 && <p className="text-xs text-muted-foreground">{t("skippedPast", { count: preview.skippedPast })}</p>}
                {preview.items.length < preview.requested && <p className="text-xs text-muted-foreground">{t("fewer", { count: preview.items.length })}</p>}
                <ol className="divide-y rounded-md border">
                  {preview.items.map((i, idx) => (
                    <li key={i.at} className={cn("space-y-1 px-3 py-2 text-sm", i.blocked.length > 0 && "bg-destructive/5")}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="w-6 font-mono text-xs text-muted-foreground tabular-nums">{idx + 1}</span>
                        <span className="font-medium capitalize">{fmt(i.at)}</span>
                        <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums">
                          <Clock className="size-3" aria-hidden /> {fmtTime(i.at)}
                        </span>
                        {i.blocked.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-destructive">
                            <Ban className="size-3" aria-hidden /> {t("blocked", { handles: i.blocked.map((b) => b.handle).join(", ") })}
                          </span>
                        )}
                        {i.shifted && (
                          <span className="inline-flex items-center gap-1 text-xs text-warning">
                            <AlertTriangle className="size-3" aria-hidden /> {t("shifted", { time: i.time })}
                          </span>
                        )}
                      </div>
                      {!i.blocked.length && <p className="line-clamp-1 pl-9 text-xs text-muted-foreground">{i.caption || "—"}</p>}
                      {!i.blocked.length && mode === "pending" && i.issues.length > 0 && (
                        <p className="flex gap-1 pl-9 text-xs text-warning">
                          <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                          {t("willBeDraft", { reasons: i.issues.map((x) => (t.has(`issues.${x}`) ? t(`issues.${x}`) : x)).join(" · ") })}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
                {mode === "pending" && <p className="text-xs text-muted-foreground">{t("pendingCount", { count: willBePending })}</p>}
              </>
            )}
          </section>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          {!preview ? (
            <Button type="button" disabled={!valid || pending} onClick={loadPreview}>
              <CalendarClock aria-hidden /> {pending ? t("previewing") : t("preview")}
            </Button>
          ) : (
            <Button type="button" disabled={pending || ok.length === 0} onClick={create}>
              {pending ? t("creating") : t("create", { count: ok.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
