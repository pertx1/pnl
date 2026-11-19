"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Flame, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localIsoDay } from "@/lib/strategy/dates";
import { CREDITS, PLATFORMS, type Platform } from "@/lib/strategy/schema";
import { Cost } from "../strategy/_components/cost";
import { NativeSelect } from "../strategy/_components/fields";
import { aiCoachWarmup, createWarmupPlan } from "./actions";

const PLATFORM_NAME: Record<Platform, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };
const PLANNED = "planned";

function today() {
  const now = new Date();
  return localIsoDay(now, now.getTimezoneOffset());
}

export function NewPlanForm(props: {
  projectId: string;
  accounts: { id: string; platform: Platform; label: string }[];
  aiReady: boolean;
  balance: number;
  cancelHref: string | null;
}) {
  const t = useTranslations("warmup");
  const te = useTranslations("strategy.errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [account, setAccount] = useState<string>(props.accounts[0]?.id ?? PLANNED);
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [handle, setHandle] = useState("");
  const [niche, setNiche] = useState("");
  const [duration, setDuration] = useState(14);
  const [startDate, setStartDate] = useState(today);
  const [coach, setCoach] = useState(false);
  const planned = account === PLANNED;

  const fail = (e: string) => {
    toast.error(te.has(e) ? te(e) : te("generic"));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await createWarmupPlan({
        projectId: props.projectId,
        accountId: planned ? null : account,
        platform: planned ? platform : (props.accounts.find((a) => a.id === account)?.platform ?? platform),
        handle: planned ? handle : "",
        niche,
        durationDays: duration,
        startDate,
      });
      if (!r.ok) return fail(r.error);
      if (coach && props.aiReady) {
        const c = await aiCoachWarmup({ projectId: props.projectId, planId: r.data.planId, issues: [], fromDay: 1, idempotencyKey: crypto.randomUUID() });
        if (!c.ok) fail(c.error);
        else toast.success(t("coach.done"));
      } else toast.success(t("created"));
      router.push(`/app/p/${props.projectId}/warmup?plan=${r.data.planId}`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="label-mono">{t("form.title")}</CardTitle>
        <CardDescription>{t("form.body")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wp-account">{t("form.account")}</Label>
              <NativeSelect id="wp-account" value={account} onChange={(e) => setAccount(e.target.value)} className="h-9 w-full">
                {props.accounts.map((a) => (
                  <option key={a.id} value={a.id}>{`${PLATFORM_NAME[a.platform]} · ${a.label}`}</option>
                ))}
                <option value={PLANNED}>{t("form.planned")}</option>
              </NativeSelect>
            </div>
            {planned && (
              <div className="space-y-1.5">
                <Label htmlFor="wp-platform">{t("form.platform")}</Label>
                <NativeSelect id="wp-platform" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} className="h-9 w-full">
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>{PLATFORM_NAME[p]}</option>
                  ))}
                </NativeSelect>
              </div>
            )}
            {planned && (
              <div className="space-y-1.5">
                <Label htmlFor="wp-handle">
                  {t("form.handle")} <span className="text-muted-foreground">({t("form.optional")})</span>
                </Label>
                <Input id="wp-handle" value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={60} placeholder="@" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="wp-niche">{t("form.niche")}</Label>
              <Input id="wp-niche" value={niche} onChange={(e) => setNiche(e.target.value)} maxLength={200} placeholder={t("form.nichePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wp-duration">{t("form.duration")}</Label>
              <NativeSelect id="wp-duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="h-9 w-full">
                {[7, 10, 14].map((d) => (
                  <option key={d} value={d}>{t("form.days", { count: d })}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wp-start">{t("form.start")}</Label>
              <Input id="wp-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="font-mono" suppressHydrationWarning />
            </div>
          </div>
          {planned && <p className="text-xs text-muted-foreground">{t("form.plannedHelp")}</p>}

          {props.aiReady ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
              <Checkbox id="wp-coach" checked={coach} onCheckedChange={(v) => setCoach(v === true)} disabled={props.balance < CREDITS.coach} />
              <Label htmlFor="wp-coach" className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-brand-amber-ink" aria-hidden /> {t("form.coach")}
              </Label>
              <Cost credits={CREDITS.coach} balance={props.balance} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("coach.notConfigured")}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={pending}>
              <Flame /> {pending ? t("form.creating") : coach ? t("form.createCoach") : t("form.create")}
            </Button>
            {props.cancelHref && (
              <Button asChild variant="ghost">
                <Link href={props.cancelHref}>{t("form.cancel")}</Link>
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
