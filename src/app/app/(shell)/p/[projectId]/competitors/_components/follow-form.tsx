"use client";

import Link from "next/link";
import { TerminalCursor } from "@/components/brand/terminal-cursor";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {Clock, Plus } from "lucide-react";
import { toast } from "sonner";
import { CreditCost } from "@/components/kreo/credit-cost";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { followCompetitor } from "../actions";
import { useResearchError } from "./shared";

type Platform = "youtube" | "instagram" | "tiktok";

export function FollowForm({
  projectId,
  canEdit,
  youtubeReady,
  instagramAccount,
  tiktokCredits,
}: {
  projectId: string;
  canEdit: boolean;
  youtubeReady: boolean;
  /** @handle de la cuenta IG conectada que se usará para Business Discovery (null si no hay). */
  instagramAccount: string | null;
  tiktokCredits: number;
}) {
  const t = useTranslations("competitors");
  const errorText = useResearchError();
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [value, setValue] = useState("");
  const [busy, start] = useTransition();

  const blocked =
    !canEdit || (platform === "youtube" && !youtubeReady) || (platform === "instagram" && !instagramAccount) || platform === "tiktok";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (blocked || value.trim().length < 2) return;
    start(async () => {
      const res = await followCompetitor({ projectId, platform, input: value });
      if (res.ok) {
        toast.success(t("followed"));
        setValue("");
        router.push(`/app/p/${projectId}/competitors/${res.id}`);
      } else toast.error(errorText(res.error));
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-describedby="follow-help">
      <div className="flex flex-wrap gap-1 rounded-md border p-0.5" role="radiogroup" aria-label={t("platform")}>
        {(["youtube", "instagram", "tiktok"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={platform === p}
            onClick={() => setPlatform(p)}
            className={cn(
              "flex min-w-[110px] flex-1 items-center justify-center gap-2 rounded-sm px-3 py-1.5 text-sm",
              platform === p ? "bg-secondary font-semibold" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <PlatformIcon platform={p} className="size-5 text-[8px]" />
            {t(`platforms.${p}`)}
            {p === "tiktok" && <span className="label-mono !text-[9px]">{t("soon")}</span>}
          </button>
        ))}
      </div>

      {platform === "tiktok" ? (
        <div className="rounded-md border border-dashed p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <Clock className="size-4 text-muted-foreground" aria-hidden /> {t("tiktok.title")}
          </p>
          <p className="mt-1 text-muted-foreground">{t("tiktok.body")}</p>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            {t("tiktok.cost")} <CreditCost credits={tiktokCredits} />
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="competitor-input">{t(`inputLabel.${platform}`)}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="competitor-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={t(`inputPlaceholder.${platform}`)}
                maxLength={300}
                disabled={blocked || busy}
                autoComplete="off"
              />
              <Button type="submit" disabled={blocked || busy || value.trim().length < 2} className="shrink-0">
                {busy ? <TerminalCursor /> : <Plus />} {t("follow")}
              </Button>
            </div>
            <p id="follow-help" className="text-xs text-muted-foreground">
              {platform === "youtube" ? t("help.youtube") : t("help.instagram", { account: instagramAccount ?? "—" })} · {t("free")}
            </p>
          </div>
          {platform === "youtube" && !youtubeReady && (
            <p role="note" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              {t("youtubeNotConfigured")}
            </p>
          )}
          {platform === "instagram" && !instagramAccount && (
            <p role="note" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              {t("instagramNeedsAccount")}{" "}
              <Link href={`/app/p/${projectId}/accounts`} className="font-medium underline underline-offset-2">
                {t("connectInstagram")}
              </Link>
            </p>
          )}
        </>
      )}
      {!canEdit && <p className="text-xs text-muted-foreground">{t("viewerHint")}</p>}
    </form>
  );
}
