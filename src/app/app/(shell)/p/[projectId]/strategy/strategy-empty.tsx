"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { FilePlus2, Map, Megaphone, Rocket, ShoppingBag, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CREDITS } from "@/lib/strategy/schema";
import { STRATEGY_GOALS, type StrategyGoal } from "@/lib/strategy/templates";
import { Cost } from "./_components/cost";
import { createEmptyStrategy, createStrategyFromTemplate } from "./actions";
import { aiGenerateStrategy } from "./ai-actions";

const GOAL_ICON: Record<StrategyGoal, typeof Users> = { audience: Users, sales: ShoppingBag, launch: Rocket };

export function StrategyEmpty({
  projectId,
  accountId,
  canEdit,
  aiReady,
  balance,
  hasAccounts,
}: {
  projectId: string;
  accountId: string | null;
  canEdit: boolean;
  aiReady: boolean;
  balance: number;
  hasAccounts: boolean;
}) {
  const t = useTranslations("strategy");
  const te = useTranslations("strategy.errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [goal, setGoal] = useState("");
  const [notes, setNotes] = useState("");
  const tz = () => new Date().getTimezoneOffset();

  const fail = (error: string) => {
    toast.error(te.has(error) ? te(error) : te("generic"));
  };

  function fromTemplate(g: StrategyGoal) {
    start(async () => {
      const r = await createStrategyFromTemplate({ projectId, accountId, goal: g, tzOffset: tz() });
      if (!r.ok) return fail(r.error);
      toast.success(t("empty.created"));
      router.refresh();
    });
  }
  function fromScratch() {
    start(async () => {
      const r = await createEmptyStrategy({ projectId, accountId });
      if (!r.ok) return fail(r.error);
      router.refresh();
    });
  }
  function withAi(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await aiGenerateStrategy({ projectId, accountId, goal, notes, tzOffset: tz(), idempotencyKey: crypto.randomUUID() });
      if (!r.ok) return fail(r.error);
      toast.success(t("ai.done"));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card className="bg-dots">
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <Map className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          <h2 className="text-lg font-medium">{t("empty.title")}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{t("empty.body")}</p>
          {!hasAccounts && (
            <p className="text-xs text-muted-foreground">
              {t("empty.noAccounts")}{" "}
              <Link href={`/app/p/${projectId}/accounts`} className="link">
                {t("empty.connect")}
              </Link>
            </p>
          )}
          {!canEdit && <p className="text-xs text-muted-foreground">{t("readOnly")}</p>}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="label-mono">{t("empty.templates")}</CardTitle>
              <CardDescription>{t("empty.templatesBody")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {STRATEGY_GOALS.map((g) => {
                const Icon = GOAL_ICON[g];
                return (
                  <button
                    key={g}
                    type="button"
                    disabled={pending}
                    onClick={() => fromTemplate(g)}
                    className="flex w-full items-start gap-3 rounded-md border border-border p-3 text-left transition-colors hover:border-primary-ink/50 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                    <span>
                      <span className="block text-sm font-medium">{t(`goals.${g}.title`)}</span>
                      <span className="block text-xs text-muted-foreground">{t(`goals.${g}.body`)}</span>
                    </span>
                  </button>
                );
              })}
              <Button variant="ghost" size="sm" disabled={pending} onClick={fromScratch}>
                <FilePlus2 /> {t("empty.scratch")}
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="label-mono flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-brand-amber-ink" aria-hidden /> {t("ai.title")}
              </CardTitle>
              <CardDescription>{t("ai.body")}</CardDescription>
            </CardHeader>
            <CardContent>
              {aiReady ? (
                <form onSubmit={withAi} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="st-goal">{t("ai.goal")}</Label>
                    <Input id="st-goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={t("ai.goalPlaceholder")} minLength={3} maxLength={300} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="st-notes">{t("ai.notes")}</Label>
                    <Textarea id="st-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("ai.notesPlaceholder")} maxLength={2000} rows={3} />
                  </div>
                  <p className="text-xs text-muted-foreground">{t("ai.context")}</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" variant="brand" disabled={pending || goal.trim().length < 3 || balance < CREDITS.strategy}>
                      <Megaphone /> {pending ? t("ai.generating") : t("ai.generate")}
                    </Button>
                    <Cost credits={CREDITS.strategy} balance={balance} />
                  </div>
                </form>
              ) : (
                <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">{t("ai.notConfigured")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
