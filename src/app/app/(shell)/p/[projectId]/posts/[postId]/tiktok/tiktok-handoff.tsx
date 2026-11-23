"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/kreo/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { markTikTokPublished } from "../../tiktok-actions";

export type HandoffView = {
  targetId: string;
  done: boolean;
  mode: "inbox" | "manual";
  reason: string | null;
  account: string;
  caption: string;
  hashtags: string[];
  commercial: "paid" | "promotional" | null;
};

export function TikTokHandoffCard({
  projectId,
  view,
  video,
  aiGenerated,
  canEdit,
}: {
  projectId: string;
  view: HandoffView;
  video: { url: string; fileName: string } | null;
  aiGenerated: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations("tiktok.handoff");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(view.done);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyError"));
    }
  }

  const reason = view.reason && t.has(`reasons.${view.reason}`) ? t(`reasons.${view.reason}`) : t("reasons.inbox_unavailable");
  const status = done ? t("statusDone") : view.mode === "inbox" ? t("statusInbox") : t("statusManual");

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">{view.account}</CardTitle>
        <StatusBadge status={done ? "published" : "awaiting_user_publish"} label={status} />
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {!done && (
          <div className="space-y-2">
            <p>{view.mode === "inbox" ? t("inboxIntro", { account: view.account }) : t("manualIntro", { account: view.account, reason })}</p>
            <p className="whitespace-pre-line rounded-md bg-secondary/60 p-3 text-[13px] leading-relaxed">
              {view.mode === "inbox" ? t("inboxSteps", { account: view.account }) : t("manualSteps")}
            </p>
          </div>
        )}

        {(aiGenerated || view.commercial) && !done && (
          <div role="note" className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            {aiGenerated && (
              <p className="flex gap-2">
                <AlertTriangle className="size-4 shrink-0" aria-hidden /> {t("aiReminder")}
              </p>
            )}
            {view.commercial && (
              <p className="flex gap-2">
                <AlertTriangle className="size-4 shrink-0" aria-hidden /> {t("commercialReminder", { label: view.commercial === "paid" ? t("labelPaid") : t("labelPromotional") })}
              </p>
            )}
          </div>
        )}

        {view.mode === "manual" && !done && (
          <div className="space-y-1">
            {video ? (
              <>
                <Button asChild variant="secondary">
                  <a href={video.url} download={video.fileName} rel="noopener">
                    <Download /> {t("download")}
                  </a>
                </Button>
                <p className="text-xs text-muted-foreground">{t("downloadHint")}</p>
              </>
            ) : (
              <p className="text-xs text-destructive">{t("noVideo")}</p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <p className="label-mono">{t("caption")}</p>
          <Textarea readOnly value={view.caption} rows={Math.min(10, Math.max(3, view.caption.split("\n").length + 1))} aria-label={t("caption")} />
          <Button type="button" size="sm" variant="secondary" onClick={() => copy(view.caption)}>
            <Copy /> {t("copy")}
          </Button>
        </div>

        <div className="space-y-2">
          <p className="label-mono">{t("hashtags")}</p>
          {view.hashtags.length ? (
            <>
              <p className="font-mono text-xs break-words">{view.hashtags.join(" ")}</p>
              <Button type="button" size="sm" variant="ghost" onClick={() => copy(view.hashtags.join(" "))}>
                <Copy /> {t("copyHashtags")}
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{t("noHashtags")}</p>
          )}
        </div>

        {!done &&
          (canEdit ? (
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  if (!window.confirm(t("markConfirm"))) return;
                  const res = await markTikTokPublished(projectId, view.targetId);
                  if (res.ok) {
                    setDone(true);
                    toast.success(t("marked"));
                    router.refresh();
                  } else toast.error(t.has(`markErrors.${res.error}`) ? t(`markErrors.${res.error}`) : t("markErrors.generic"));
                })
              }
            >
              <CheckCircle2 /> {t("markPublished")}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">{t("readOnly")}</p>
          ))}
      </CardContent>
    </Card>
  );
}
