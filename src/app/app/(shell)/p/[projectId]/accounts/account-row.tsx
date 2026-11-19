"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { disconnectAccount, updateDailyLimit } from "./actions";

type Account = {
  id: string;
  platform: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: "active" | "expired" | "missing_scopes" | "revoked" | "error";
  missing_scopes: string[];
  daily_post_limit: number;
  max: number;
};

const COLORS: Record<Account["status"], string> = {
  active: "var(--success)",
  expired: "var(--warning)",
  missing_scopes: "var(--warning)",
  revoked: "var(--destructive)",
  error: "var(--destructive)",
};

export function AccountRow({ account: a, isAdmin, reconnectHref }: { account: Account; isAdmin: boolean; reconnectHref: string }) {
  const t = useTranslations("accounts");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const [limit, setLimit] = useState(a.daily_post_limit);
  const [pending, start] = useTransition();
  const color = COLORS[a.status];

  return (
    <div className="flex flex-wrap items-center gap-4 py-4">
      <PlatformIcon platform={a.platform} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{a.display_name || a.handle}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {a.handle && <span className="font-mono">@{a.handle.replace(/^@/, "")}</span>}
          <span className="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 font-semibold" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
            <span className="size-1.5 rounded-full" style={{ background: color }} />
            {t(`status.${a.status}`)}
          </span>
        </div>
        {a.missing_scopes.length > 0 && <p className="mt-1 text-xs text-warning">{t("missingScopes", { scopes: a.missing_scopes.join(", ") })}</p>}
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground" title={t("dailyLimitHint", { max: a.max })}>
        <span className="label-mono">{t("dailyLimit")}</span>
        <Input
          type="number"
          min={1}
          max={a.max}
          value={limit}
          disabled={!isAdmin || pending}
          onChange={(e) => setLimit(Number(e.target.value))}
          onBlur={() => {
            if (limit === a.daily_post_limit) return;
            start(async () => {
              const res = await updateDailyLimit(a.id, limit);
              if (res?.error) {
                toast.error(te(res.error));
                setLimit(a.daily_post_limit);
              } else toast.success(tc("saved"));
            });
          }}
          className="h-8 w-16 font-mono"
        />
      </label>

      <div className="flex gap-2">
        {a.status !== "active" && (
          <Button asChild variant="secondary" size="sm">
            <a href={reconnectHref}>
              <RefreshCw /> {t("reconnect")}
            </a>
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!confirm(t("disconnectConfirm"))) return;
              start(async () => {
                const res = await disconnectAccount(a.id);
                if (res?.error) toast.error(te(res.error));
              });
            }}
          >
            <Unplug /> {t("disconnect")}
          </Button>
        )}
      </div>
    </div>
  );
}
