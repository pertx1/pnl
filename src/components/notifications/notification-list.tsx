"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { deleteNotification, markNotificationsRead } from "@/app/app/(shell)/notifications/actions";
import { Button } from "@/components/ui/button";
import type { NotificationItem } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";
import { NotificationIcon } from "./notification-icon";

/** Lista completa de avisos (página /app/notifications). */
export function NotificationList({ initial }: { initial: NotificationItem[] }) {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const [items, setItems] = useState(initial);
  const [pending, start] = useTransition();
  const unread = items.filter((n) => !n.readAt).length;

  const markAll = () =>
    start(async () => {
      const r = await markNotificationsRead();
      if (r.ok) setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    });
  const markOne = (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)));
    void markNotificationsRead([id]);
  };
  const remove = (id: string) =>
    start(async () => {
      const r = await deleteNotification(id);
      if (r.ok) setItems((prev) => prev.filter((n) => n.id !== id));
    });

  if (!items.length) {
    return (
      <div className="surface flex flex-col items-center gap-3 rounded-xl px-6 py-14 text-center">
        <Bell className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        <p className="max-w-sm text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={markAll} disabled={pending || unread === 0}>
          <CheckCheck /> {t("markAllRead")}
        </Button>
      </div>
      <ul className="surface divide-y rounded-xl">
        {items.map((n) => (
          <li key={n.id} className="flex items-start gap-3 px-4 py-3">
            <NotificationIcon type={n.type} />
            <div className="min-w-0 flex-1">
              {n.link ? (
                <Link href={n.link} onClick={() => markOne(n.id)} className={cn("block text-sm hover:underline", !n.readAt && "font-medium")}>
                  {n.title}
                </Link>
              ) : (
                <p className={cn("text-sm", !n.readAt && "font-medium")}>{n.title}</p>
              )}
              {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
              <p className="mt-0.5 text-xs text-muted-foreground">
                <time dateTime={n.createdAt}>{format.dateTime(new Date(n.createdAt), { dateStyle: "medium", timeStyle: "short" })}</time>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!n.readAt && (
                <Button variant="ghost" size="icon-sm" onClick={() => markOne(n.id)} aria-label={t("markRead")} title={t("markRead")}>
                  <span className="size-2 rounded-full bg-primary" aria-hidden />
                </Button>
              )}
              <Button variant="ghost" size="icon-sm" onClick={() => remove(n.id)} disabled={pending} aria-label={t("delete")} title={t("delete")}>
                <Trash2 strokeWidth={1.5} />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
