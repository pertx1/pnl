"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Clock, Plus, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { InboxChannel } from "@/lib/supabase/types/inbox";
import { cn } from "@/lib/utils";
import { disconnect, syncNow } from "./actions";
import { ChannelIcon } from "./channel-icon";

type Conn = { id: string; channel: InboxChannel; label: string; status: string; lastSyncedAt: string | null; socialAccountId: string | null };

export function ConnectionsPanel({
  projectId,
  canEdit,
  isAdmin,
  configured,
  connections,
  igAccounts,
}: {
  projectId: string;
  canEdit: boolean;
  isAdmin: boolean;
  configured: Record<InboxChannel, boolean>;
  connections: Conn[];
  igAccounts: { id: string; handle: string }[];
}) {
  const t = useTranslations("inbox");
  const start = (channel: InboxChannel, account?: string) =>
    `/api/inbox/oauth/${channel}/start?project=${projectId}${account ? `&account=${account}` : ""}`;

  return (
    <section aria-labelledby="inbox-channels" className="space-y-2">
      <h2 id="inbox-channels" className="label-mono">
        {t("channels")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/* Instagram */}
        <ChannelCard channel="instagram" configured={configured.instagram}>
          {igAccounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("igNeedsAccount")}{" "}
              <Link href={`/app/p/${projectId}/accounts`} className="text-primary-ink underline-offset-4 hover:underline">
                {t("goAccounts")}
              </Link>
            </p>
          ) : (
            <ul className="space-y-2">
              {igAccounts.map((a) => {
                const c = connections.find((x) => x.channel === "instagram" && x.socialAccountId === a.id);
                return (
                  <li key={a.id}>
                    {c ? (
                      <ConnectionRow conn={c} canEdit={canEdit} isAdmin={isAdmin} reconnectHref={start("instagram", a.id)} />
                    ) : (
                      <ConnectLink href={start("instagram", a.id)} disabled={!canEdit || !configured.instagram} label={t("activateIg", { handle: a.handle })} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ChannelCard>

        {(["gmail", "outlook"] as const).map((ch) => (
          <ChannelCard key={ch} channel={ch} configured={configured[ch]}>
            <ul className="space-y-2">
              {connections
                .filter((c) => c.channel === ch)
                .map((c) => (
                  <li key={c.id}>
                    <ConnectionRow conn={c} canEdit={canEdit} isAdmin={isAdmin} reconnectHref={start(ch)} />
                  </li>
                ))}
              <li>
                <ConnectLink href={start(ch)} disabled={!canEdit || !configured[ch]} label={t(`connect.${ch}`)} />
              </li>
            </ul>
          </ChannelCard>
        ))}

        {/* TikTok: sin API pública de mensajes directos → próximamente, sin atajos. */}
        <Card className="gap-2 border-dashed py-4">
          <CardContent className="space-y-2 px-4">
            <div className="flex items-center gap-2">
              <ChannelIcon channel="tiktok" className="size-7" />
              <span className="text-sm font-medium">{t("channelNames.tiktok")}</span>
              <span className="ml-auto rounded-sm border px-1.5 py-px text-[10px] text-muted-foreground">{t("soon")}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("tiktokSoon")}</p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function ChannelCard({ channel, configured, children }: { channel: InboxChannel; configured: boolean; children: React.ReactNode }) {
  const t = useTranslations("inbox");
  return (
    <Card className="gap-2 py-4">
      <CardContent className="space-y-3 px-4">
        <div className="flex items-center gap-2">
          <ChannelIcon channel={channel} className="size-7" />
          <span className="text-sm font-medium">{t(`channelNames.${channel}`)}</span>
          {!configured && <span className="ml-auto rounded-sm border border-warning/40 px-1.5 py-px text-[10px] text-warning">{t("notConfigured")}</span>}
        </div>
        {!configured && <p className="text-xs text-muted-foreground">{t(`notConfiguredHint.${channel}`)}</p>}
        {children}
      </CardContent>
    </Card>
  );
}

function ConnectLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return (
      <Button variant="secondary" size="sm" disabled className="w-full">
        <Plus aria-hidden /> {label}
      </Button>
    );
  }
  return (
    <Button asChild variant="secondary" size="sm" className="w-full">
      {/* Navegación completa: el OAuth sale a Google/Microsoft/Meta. */}
      <a href={href}>
        <Plus aria-hidden /> {label}
      </a>
    </Button>
  );
}

function ConnectionRow({ conn, canEdit, isAdmin, reconnectHref }: { conn: Conn; canEdit: boolean; isAdmin: boolean; reconnectHref: string }) {
  const t = useTranslations("inbox");
  const format = useFormatter();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const active = conn.status === "active";

  return (
    <div className="space-y-1.5 rounded-md border px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", active ? "bg-success" : "bg-warning")} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={conn.label}>
          {conn.label}
        </span>
        {canEdit && active && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("syncNow")}
            title={t("syncNow")}
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                const res = await syncNow(conn.id);
                if (res.ok) toast.success(t("synced"));
                else toast.error(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : t("errors.default"));
                router.refresh();
              })
            }
          >
            <RefreshCw className={cn(busy && "animate-spin")} />
          </Button>
        )}
      </div>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Clock className="size-3" aria-hidden />
        {active
          ? conn.lastSyncedAt
            ? t("lastSynced", { time: format.relativeTime(new Date(conn.lastSyncedAt)) })
            : t("neverSynced")
          : t("expired")}
      </p>
      {!active && canEdit && (
        <a href={reconnectHref} className="text-xs text-primary-ink underline-offset-4 hover:underline">
          {t("reconnect")}
        </a>
      )}
      {isAdmin &&
        (confirming ? (
          <div className="space-y-1.5 pt-1" role="group" aria-label={t("disconnect")}>
            <p className="text-[11px] text-muted-foreground">{t(conn.channel === "outlook" ? "disconnectConfirmOutlook" : "disconnectConfirm")}</p>
            <div className="flex gap-1.5">
              <Button
                variant="destructive"
                size="xs"
                disabled={busy}
                onClick={() =>
                  startTransition(async () => {
                    const res = await disconnect(conn.id);
                    if (res.ok) toast.success(t("disconnected"));
                    else toast.error(t("errors.default"));
                    setConfirming(false);
                    router.refresh();
                  })
                }
              >
                {t("disconnectYes")}
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setConfirming(false)}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive">
            <Unplug className="size-3" aria-hidden /> {t("disconnect")}
          </button>
        ))}
    </div>
  );
}
