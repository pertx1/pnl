"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { CreditCost } from "@/components/kreo/credit-cost";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { clipCopyCredits } from "@/lib/clipper/schedule";
import { cn } from "@/lib/utils";
import { previewClipSchedule, scheduleClips, type SchedulePreview, type ScheduleResult } from "./actions";

export type ScheduleAccount = { id: string; platform: string; handle: string | null; dailyLimit: number };

/**
 * «Programar clips»: el usuario elige cuentas; Kreo propone fechas en los próximos huecos libres (vista previa gratis),
 * escribe el texto de cada red con IA y crea BORRADORES con el clip. Nada se publica sin aprobación humana.
 */
export function SchedulePanel({
  projectId,
  clips,
  accounts,
  balance,
  enabled,
}: {
  projectId: string;
  clips: { id: string; title: string }[];
  accounts: ScheduleAccount[];
  balance: number;
  enabled: boolean;
}) {
  const t = useTranslations("clipper.scheduler");
  const tc = useTranslations("clipper");
  const format = useFormatter();
  const router = useRouter();
  const approvalId = useId();
  const [accountIds, setAccountIds] = useState<string[]>(accounts.length === 1 ? [accounts[0].id] : []);
  const [perDay, setPerDay] = useState(1);
  const [submit, setSubmit] = useState(false);
  const [rawPreview, setPreview] = useState<SchedulePreview | null>(null);
  const [rawPreviewError, setPreviewError] = useState<string>();
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [busy, start] = useTransition();
  const clipIds = clips.map((c) => c.id).join(",");
  const active = accountIds.length > 0 && clipIds.length > 0;
  const preview = active ? rawPreview : null;
  const previewError = active ? rawPreviewError : undefined;

  // Vista previa (gratis) cada vez que cambian clips, cuentas o ritmo.
  useEffect(() => {
    let cancelled = false;
    if (!accountIds.length || !clipIds) return;
    previewClipSchedule({ projectId, segmentIds: clipIds.split(","), accountIds, perDay }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setPreview(res.data ?? null);
        setPreviewError(undefined);
      } else {
        setPreview(null);
        setPreviewError(res.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, clipIds, accountIds, perDay]);

  const credits = preview ? clipCopyCredits(preview.slots.length) : clipCopyCredits(clips.length);
  const errText = (code: string) => (tc.has(`errors.${code}`) ? tc(`errors.${code}`) : tc("errors.generic"));
  const title = (id: string) => clips.find((c) => c.id === id)?.title ?? "";
  const when = (iso: string) => format.dateTime(new Date(iso), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: preview?.timezone ?? "Europe/Madrid" });

  if (!accounts.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("noAccounts")}{" "}
        <Link href={`/app/p/${projectId}/accounts`} className="link">
          {t("connect")}
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="label-mono">{t("accounts")}</legend>
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => {
            const on = accountIds.includes(a.id);
            return (
              <label key={a.id} className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm sm:min-h-9", on && "border-selected bg-primary/10")}>
                <Checkbox checked={on} onCheckedChange={(v) => setAccountIds((p) => (v ? [...p, a.id] : p.filter((x) => x !== a.id)))} />
                <PlatformIcon platform={a.platform} className="size-4" label />
                <span>{a.handle ? `@${a.handle.replace(/^@/, "")}` : a.platform}</span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">{t("limit", { n: a.dailyLimit })}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="label-mono">{t("perDay")}</legend>
        <div role="radiogroup" className="flex gap-1.5">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={perDay === n}
              onClick={() => setPerDay(n)}
              className={cn("min-h-11 min-w-11 rounded-md border px-3 font-mono text-sm tabular-nums sm:min-h-9", perDay === n ? "border-selected bg-primary/10" : "text-muted-foreground")}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t("perDayHint")}</p>
      </fieldset>

      {previewError && <p className="text-sm text-destructive">{errText(previewError)}</p>}
      {preview && (
        <div className="space-y-1.5">
          <p className="label-mono">{t("proposal")}</p>
          <ol className="divide-y rounded-md border text-sm">
            {preview.slots.map((s) => (
              <li key={s.segmentId} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                <span className="font-mono text-xs tabular-nums">{when(s.scheduledAt)}</span>
                <span className="min-w-0 flex-1 truncate">{title(s.segmentId)}</span>
              </li>
            ))}
          </ol>
          {preview.unscheduled.length > 0 && <p className="text-xs text-warning">{t("unscheduled", { n: preview.unscheduled.length })}</p>}
          <p className="text-xs text-muted-foreground">{t("proposalHint")}</p>
        </div>
      )}

      <label htmlFor={approvalId} className="flex items-start gap-2 text-sm">
        <Checkbox id={approvalId} checked={submit} onCheckedChange={(v) => setSubmit(Boolean(v))} className="mt-0.5" />
        <span>
          <span className="font-medium">{t("submit")}</span>
          <span className="block text-xs text-muted-foreground">{t("submitHint")}</span>
        </span>
      </label>

      {result && (
        <div role="status" className="space-y-1 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm">
          <p>{t("done", { n: result.created.length })}</p>
          <Link href={`/app/p/${projectId}/calendar`} className="link text-sm">
            {t("openCalendar")}
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="label-mono">{t("cost")}</span>
          <CreditCost credits={credits} />
          <span className="font-mono text-xs text-muted-foreground">{tc("balance", { balance })}</span>
        </div>
        <Button
          variant="brand"
          disabled={!enabled || busy || !preview?.slots.length || balance < credits}
          onClick={() =>
            start(async () => {
              const res = await scheduleClips({ projectId, segmentIds: clipIds.split(","), accountIds, perDay, submitForApproval: submit, idempotencyKey: crypto.randomUUID() });
              if (!res.ok) return void toast.error(errText(res.error));
              setResult(res.data ?? null);
              toast.success(t("done", { n: res.data?.created.length ?? 0 }));
              router.refresh();
            })
          }
        >
          <CalendarClock aria-hidden /> {busy ? t("working") : `${t("button", { n: preview?.slots.length ?? clips.length })} · ${credits}`}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("legal")}</p>
    </div>
  );
}
