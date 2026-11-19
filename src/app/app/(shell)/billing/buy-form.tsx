"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { buyCredits } from "./actions";

export function BuyPackForm({
  packId,
  credits,
  price,
  perCredit,
  highlight,
  disabled,
}: {
  packId: string;
  credits: number;
  price: string;
  perCredit: string;
  highlight: boolean;
  disabled: boolean;
}) {
  const t = useTranslations("billing");
  const [state, action] = useActionState(buyCredits, undefined);
  const [waiver, setWaiver] = useState(false);
  return (
    <Card className={cn(highlight && "border-selected")}>
      <CardContent>
        <form action={action} className="space-y-3">
          <input type="hidden" name="packId" value={packId} />
          <div className="flex items-center justify-between">
            <span className="font-mono text-2xl font-semibold tabular-nums">{credits.toLocaleString()}</span>
            {highlight && <Badge>{t("popular")}</Badge>}
          </div>
          <p className="label-mono">{t("credits", { n: credits })}</p>
          <p className="text-[28px] leading-tight font-medium">{price}</p>
          <p className="font-mono text-xs text-muted-foreground">{t("perCredit", { price: perCredit })}</p>
          <label className="flex items-start gap-2 text-[11px] leading-snug text-muted-foreground">
            <Checkbox name="waiver" checked={waiver} onCheckedChange={(v) => setWaiver(Boolean(v))} className="mt-0.5" disabled={disabled} />
            {t("waiver")}
          </label>
          {state?.error && <p className="text-xs text-destructive">{t.has(`errors.${state.error}`) ? t(`errors.${state.error}`) : t("errors.generic")}</p>}
          <SubmitButton className="w-full" variant={highlight ? "default" : "secondary"} disabled={disabled || !waiver} pendingLabel={t("buying")}>
            {t("buy")}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
