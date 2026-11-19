"use client";

import { useRouter } from "next/navigation";
import { TerminalCursor } from "@/components/brand/terminal-cursor";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import {BellOff, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markAlertsSeen, refreshCompetitorNow, unfollowCompetitor } from "../actions";
import { useResearchError } from "./shared";

export function CompetitorControls({ projectId, competitorId }: { projectId: string; competitorId: string }) {
  const t = useTranslations("competitors");
  const errorText = useResearchError();
  const router = useRouter();
  const [busy, start] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const r = await refreshCompetitorNow(competitorId);
            if (r.ok) toast.success(t("refreshed"));
            else toast.error(errorText(r.error));
            router.refresh();
          })
        }
      >
        {busy ? <TerminalCursor /> : <RefreshCw />} {t("refresh")}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={busy}
        onClick={() => {
          if (!window.confirm(t("unfollowConfirm"))) return;
          start(async () => {
            const r = await unfollowCompetitor(competitorId);
            if (r.ok) {
              toast.success(t("unfollowed"));
              router.push(`/app/p/${projectId}/competitors`);
            } else toast.error(errorText(r.error));
          });
        }}
      >
        <Trash2 /> {t("unfollow")}
      </Button>
    </div>
  );
}

export function MarkAlertsSeenButton({ projectId }: { projectId: string }) {
  const t = useTranslations("competitors.alerts");
  const errorText = useResearchError();
  const [busy, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await markAlertsSeen(projectId);
          if (!r.ok) toast.error(errorText(r.error));
        })
      }
    >
      <BellOff /> {t("markSeen")}
    </Button>
  );
}
