"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { fetchNotificationsPanel, fetchUnreadCount, markNotificationsRead } from "@/app/app/(shell)/notifications/actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { NotificationItem } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";
import { NotificationIcon } from "./notification-icon";

const POLL_MS = 60_000;

/** Campana con contador y panel desplegable de avisos. Se usa en la barra lateral y en la cabecera móvil. */
export function NotificationBell({ initialUnread, align = "start", className }: { initialUnread: number; align?: "start" | "end"; className?: string }) {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const pathname = usePathname();
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  const ref = useRef<HTMLButtonElement>(null);

  const refreshCount = useCallback(() => {
    // Hay dos campanas montadas (barra lateral y cabecera móvil): solo consulta la visible.
    if (!ref.current || ref.current.offsetParent === null) return;
    fetchUnreadCount()
      .then(setUnread)
      .catch(() => undefined);
  }, []);

  // Contador al navegar, al volver a la pestaña y cada minuto (sin tiempo real: suficiente y barato).
  useEffect(() => {
    refreshCount();
  }, [pathname, refreshCount]);
  useEffect(() => {
    const onFocus = () => document.visibilityState === "visible" && refreshCount();
    document.addEventListener("visibilitychange", onFocus);
    const id = window.setInterval(onFocus, POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(id);
    };
  }, [refreshCount]);

  const load = () => {
    setFailed(false);
    fetchNotificationsPanel()
      .then((r) => {
        setItems(r.items);
        setUnread(r.unread);
      })
      .catch(() => setFailed(true));
  };

  const markAll = () =>
    start(async () => {
      const r = await markNotificationsRead();
      if (r.ok) {
        setUnread(0);
        setItems((prev) => prev?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? prev);
      }
    });

  const openItem = (n: NotificationItem) => {
    if (n.readAt) return;
    setUnread((u) => Math.max(0, u - 1));
    setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? prev);
    void markNotificationsRead([n.id]);
  };

  const label = unread ? t("bellUnread", { count: unread }) : t("bell");

  return (
    <DropdownMenu onOpenChange={(o) => o && load()}>
      <DropdownMenuTrigger asChild>
        <Button ref={ref} variant="ghost" size="icon-sm" aria-label={label} title={label} className={cn("relative", className)}>
          <Bell strokeWidth={1.5} />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] leading-4 text-primary-foreground tabular-nums"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <p className="label-mono">{t("title")}</p>
          <Button variant="ghost" size="sm" onClick={markAll} disabled={pending || unread === 0}>
            <CheckCheck /> {t("markAllRead")}
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto" aria-live="polite">
          {failed ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("error")}</p>
          ) : items === null ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <Bell className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const content = (
                  <>
                    <NotificationIcon type={n.type} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm", !n.readAt && "font-medium")}>{n.title}</span>
                      {n.body && <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>}
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{format.relativeTime(new Date(n.createdAt))}</span>
                    </span>
                    {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label={t("unread")} />}
                  </>
                );
                const cls = "flex w-full items-start gap-3 px-3 py-2.5 text-left outline-none hover:bg-accent/60 focus-visible:bg-accent";
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} className={cls} onClick={() => openItem(n)}>
                        {content}
                      </Link>
                    ) : (
                      <button type="button" className={cls} onClick={() => openItem(n)}>
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t p-1">
          <Link href="/app/notifications" className="block rounded-md px-3 py-2 text-center text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground">
            {t("viewAll")}
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
