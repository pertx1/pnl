"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { openBillingPortal, startSubscription } from "./actions";

export type PlanCardData = {
  id: string;
  name: string;
  price: string;
  isFree: boolean;
  highlight: boolean;
  limits: { projects: number; socialAccounts: number; members: number; monthlyCredits: number };
};

function ActionError({ error }: { error?: string }) {
  const t = useTranslations("plans");
  if (!error) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.generic")}
    </p>
  );
}

function SubscribeForm({ planId, disabled, highlight }: { planId: string; disabled: boolean; highlight: boolean }) {
  const t = useTranslations("plans");
  const [state, action] = useActionState(startSubscription, undefined);
  const [terms, setTerms] = useState(false);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="planId" value={planId} />
      <label className="flex items-start gap-2 text-[11px] leading-snug text-muted-foreground">
        <Checkbox name="terms" checked={terms} onCheckedChange={(v) => setTerms(Boolean(v))} className="mt-0.5" disabled={disabled} />
        <span>
          {t.rich("subscribeTerms", {
            terms: (chunks) => (
              <Link href="/legal/terminos" target="_blank" className="link">
                {chunks}
              </Link>
            ),
          })}
        </span>
      </label>
      <ActionError error={state?.error} />
      <SubmitButton className="w-full" variant={highlight ? "default" : "secondary"} disabled={disabled || !terms} pendingLabel={t("redirecting")}>
        {t("subscribe")}
      </SubmitButton>
    </form>
  );
}

export function ManageSubscriptionButton({ disabled }: { disabled?: boolean }) {
  const t = useTranslations("plans");
  const [state, action] = useActionState(openBillingPortal, undefined);
  return (
    <form action={action} className="space-y-2">
      <SubmitButton variant="secondary" disabled={disabled} pendingLabel={t("redirecting")}>
        {t("manage")}
      </SubmitButton>
      <ActionError error={state?.error} />
    </form>
  );
}

export function PlansGrid({
  plans,
  currentPlanId,
  canManage,
  configured,
  hasActiveSubscription,
}: {
  plans: PlanCardData[];
  currentPlanId: string;
  canManage: boolean;
  configured: boolean;
  hasActiveSubscription: boolean;
}) {
  const t = useTranslations("plans");
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {plans.map((p) => {
        const current = p.id === currentPlanId;
        return (
          <Card key={p.id} className={cn("flex flex-col", p.highlight && !current && "border-selected", current && "ring-1 ring-primary/50")}>
            <CardContent className="flex flex-1 flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-medium">{p.name}</h3>
                {current ? <Badge variant="secondary">{t("current")}</Badge> : p.highlight ? <Badge>{t("recommended")}</Badge> : null}
              </div>
              <p>
                <span className="text-[28px] leading-tight font-medium">{p.price}</span>
                {!p.isFree && <span className="text-sm text-muted-foreground"> {t("perMonth")}</span>}
              </p>
              <ul className="space-y-1.5 text-sm">
                {(
                  [
                    ["projects", p.limits.projects],
                    ["socialAccounts", p.limits.socialAccounts],
                    ["members", p.limits.members],
                    ["monthlyCredits", p.limits.monthlyCredits],
                  ] as const
                ).map(([k, n]) => (
                  <li key={k} className="flex items-center gap-2">
                    <Check className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                    {t(`features.${k}`, { n })}
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                {p.isFree ? (
                  <p className="text-xs text-muted-foreground">{current ? t("freeCurrent") : t("freeDowngrade")}</p>
                ) : current ? (
                  <p className="text-xs text-muted-foreground">{t("currentHint")}</p>
                ) : hasActiveSubscription ? (
                  <p className="text-xs text-muted-foreground">{t("changeInPortal")}</p>
                ) : (
                  <SubscribeForm planId={p.id} disabled={!canManage || !configured} highlight={p.highlight} />
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
