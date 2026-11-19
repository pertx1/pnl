"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Download, Pause, Play, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createSchedule, deleteSchedule, sendNow, toggleSchedule, type ReportActionResult } from "./actions";

const selectCls = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function useErr() {
  const t = useTranslations("commerce.reports.errors");
  return (r: ReportActionResult) => {
    if ("error" in r && r.error) toast.error(t.has(r.error) ? t(r.error) : t("generic"));
  };
}

function ToggleRow({ id, label, checked, onChange, disabled }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export function DownloadForm({ projectId, hasStore, defaultLocale }: { projectId: string; hasStore: boolean; defaultLocale: "es" | "en" }) {
  const t = useTranslations("commerce.reports");
  const id = useId();
  const [days, setDays] = useState("30");
  const [locale, setLocale] = useState(defaultLocale);
  const [sales, setSales] = useState(hasStore);
  const [footer, setFooter] = useState(true);
  const href = `/api/reports/pdf?project=${projectId}&days=${days}&locale=${locale}&sales=${sales ? 1 : 0}&footer=${footer ? 1 : 0}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-days`}>{t("period")}</Label>
          <select id={`${id}-days`} value={days} onChange={(e) => setDays(e.target.value)} className={selectCls}>
            {["7", "30", "90"].map((d) => (
              <option key={d} value={d}>
                {t("lastDays", { days: d })}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-locale`}>{t("language")}</Label>
          <select id={`${id}-locale`} value={locale} onChange={(e) => setLocale(e.target.value as "es" | "en")} className={selectCls}>
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
      <ToggleRow id={`${id}-sales`} label={hasStore ? t("includeSales") : t("includeSalesNoStore")} checked={sales && hasStore} onChange={setSales} disabled={!hasStore} />
      <ToggleRow id={`${id}-footer`} label={t("showFooter")} checked={footer} onChange={setFooter} />
      <Button asChild>
        <a href={href} download>
          <Download aria-hidden /> {t("download")}
        </a>
      </Button>
    </div>
  );
}

export function ScheduleForm({ projectId, hasStore, defaultLocale, defaultSender }: { projectId: string; hasStore: boolean; defaultLocale: "es" | "en"; defaultSender: string }) {
  const t = useTranslations("commerce.reports");
  const showErr = useErr();
  const id = useId();
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("weekly");
  const [recipients, setRecipients] = useState("");
  const [sender, setSender] = useState(defaultSender.slice(0, 80));
  const [locale, setLocale] = useState(defaultLocale);
  const [sales, setSales] = useState(hasStore);
  const [footer, setFooter] = useState(true);
  const [consent, setConsent] = useState(false);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-4 rounded-md border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createSchedule({ projectId, frequency, recipients, senderName: sender, locale, includeSales: sales && hasStore, showFooter: footer, consent: consent as true });
          if (r.ok) {
            toast.success(t("scheduleCreated"));
            setRecipients("");
            setConsent(false);
          } else showErr(r);
        });
      }}
    >
      <p className="label-mono">{t("newSchedule")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-freq`}>{t("frequency")}</Label>
          <select id={`${id}-freq`} value={frequency} onChange={(e) => setFrequency(e.target.value as "weekly" | "monthly")} className={selectCls}>
            <option value="weekly">{t("weekly")}</option>
            <option value="monthly">{t("monthly")}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-sender`}>{t("sender")}</Label>
          <Input id={`${id}-sender`} required maxLength={80} value={sender} onChange={(e) => setSender(e.target.value)} aria-describedby={`${id}-sender-hint`} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-lang`}>{t("language")}</Label>
          <select id={`${id}-lang`} value={locale} onChange={(e) => setLocale(e.target.value as "es" | "en")} className={selectCls}>
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
      <p id={`${id}-sender-hint`} className="-mt-2 text-xs text-muted-foreground">
        {t("senderHint")}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-to`}>{t("recipients")}</Label>
        <Textarea id={`${id}-to`} required rows={2} value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="cliente@empresa.com, marketing@empresa.com" aria-describedby={`${id}-to-hint`} />
        <p id={`${id}-to-hint`} className="text-xs text-muted-foreground">
          {t("recipientsHint")}
        </p>
      </div>
      <ToggleRow id={`${id}-sales`} label={hasStore ? t("includeSales") : t("includeSalesNoStore")} checked={sales && hasStore} onChange={setSales} disabled={!hasStore} />
      <ToggleRow id={`${id}-footer`} label={t("showFooter")} checked={footer} onChange={setFooter} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 accent-[var(--primary)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        <span>{t("consent")}</span>
      </label>
      <Button type="submit" disabled={pending || !consent}>
        {pending ? t("saving") : t("createSchedule")}
      </Button>
    </form>
  );
}

type Schedule = { id: string; frequency: "weekly" | "monthly"; recipients: string[]; sender: string; active: boolean; nextRun: string; lastSent: string | null };

export function ScheduleRow({ projectId, schedule: s, canEdit }: { projectId: string; schedule: Schedule; canEdit: boolean }) {
  const t = useTranslations("commerce.reports");
  const showErr = useErr();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ReportActionResult>, okMsg?: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (okMsg) toast.success(okMsg);
      } else showErr(r);
    });

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{s.frequency === "weekly" ? t("weekly") : t("monthly")}</span>
          <span className={`rounded-sm px-1.5 py-0.5 text-xs font-semibold ${s.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{s.active ? t("active") : t("paused")}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground" title={s.recipients.join(", ")}>
          {t("to", { list: s.recipients.join(", ") })}
        </p>
        <p className="text-xs text-muted-foreground">
          {s.active ? t("nextRun", { when: s.nextRun }) : ""} {s.lastSent ? `· ${t("lastSent", { when: s.lastSent })}` : ""}
        </p>
      </div>
      {canEdit && (
        <div className="flex gap-1">
          <Button variant="secondary" size="sm" disabled={pending || !s.active} onClick={() => run(() => sendNow(projectId, s.id), t("sendStarted"))}>
            <Send aria-hidden /> {t("sendNow")}
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={s.active ? t("pause") : t("resume")} onClick={() => run(() => toggleSchedule(projectId, s.id, !s.active))}>
            {s.active ? <Pause aria-hidden /> : <Play aria-hidden />}
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={t("delete")} onClick={() => run(() => deleteSchedule(projectId, s.id))}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      )}
    </li>
  );
}
