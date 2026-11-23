"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { saveAgendaSettings } from "@/app/app/(shell)/agenda/actions";
import { TerminalCursor } from "@/components/brand/terminal-cursor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { hhmm, type DaySettings } from "@/lib/agenda/core";

const COMMON_TZ = ["Europe/Madrid", "Atlantic/Canary", "Europe/London", "Europe/Lisbon", "Europe/Paris", "America/Mexico_City", "America/Bogota", "America/Buenos_Aires", "America/New_York", "UTC"];

/** Jornada: entre qué horas se calculan los huecos libres y en qué zona horaria. */
export function SettingsDialog({ open, onClose, settings }: { open: boolean; onClose: () => void; settings: DaySettings }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">{open && <SettingsForm onClose={onClose} settings={settings} />}</DialogContent>
    </Dialog>
  );
}

function SettingsForm({ onClose, settings }: { onClose: () => void; settings: DaySettings }) {
  const t = useTranslations("agenda.settingsDialog");
  const te = useTranslations("agenda.errors");
  const [pending, start] = useTransition();
  const [from, setFrom] = useState(hhmm(settings.startMinute));
  const [to, setTo] = useState(hhmm(settings.endMinute === 1440 ? 0 : settings.endMinute));
  const [tz, setTz] = useState(settings.timezone);
  const [error, setError] = useState<string | null>(null);
  const zones = COMMON_TZ.includes(tz) ? COMMON_TZ : [tz, ...COMMON_TZ];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await saveAgendaSettings({ start: from, end: to === "00:00" ? "24:00" : to, timezone: tz });
      if (res.ok) {
        toast.success(t("saved"));
        onClose();
      } else setError(te(res.error));
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("intro")}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">{t("start")}</span>
          <Input type="time" step={900} value={from} onChange={(e) => setFrom(e.target.value)} required />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">{t("end")}</span>
          <Input type="time" step={900} value={to} onChange={(e) => setTo(e.target.value)} required />
        </label>
      </div>
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">{t("timezone")}</span>
        <select
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-black/20"
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending && <TerminalCursor />}
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
