"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveNotificationPreferences } from "@/app/app/(shell)/notifications/actions";
import { Switch } from "@/components/ui/switch";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notifications/types";

/** Preferencias de avisos: un interruptor por tipo (todo activado por defecto). Se guarda al cambiar. */
export function NotificationPrefsForm({ disabled: initial }: { disabled: NotificationType[] }) {
  const t = useTranslations("notifications.prefs");
  const [disabled, setDisabled] = useState<Set<NotificationType>>(new Set(initial));
  const [pending, start] = useTransition();

  const toggle = (type: NotificationType, on: boolean) => {
    const prev = disabled;
    const next = new Set(prev);
    if (on) next.delete(type);
    else next.add(type);
    setDisabled(next);
    start(async () => {
      const r = await saveNotificationPreferences([...next]);
      if (r.ok) toast.success(t("saved"));
      else {
        setDisabled(prev);
        toast.error(t("error"));
      }
    });
  };

  return (
    <ul className="divide-y">
      {NOTIFICATION_TYPES.map((type) => {
        const id = `notif-pref-${type}`;
        return (
          <li key={type} className="flex items-center justify-between gap-4 py-2.5">
            <label htmlFor={id} className="text-sm">
              {t(`types.${type}`)}
            </label>
            <Switch id={id} checked={!disabled.has(type)} disabled={pending} onCheckedChange={(on) => toggle(type, on)} />
          </li>
        );
      })}
    </ul>
  );
}
