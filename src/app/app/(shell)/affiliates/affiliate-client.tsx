"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { claimReferral, joinAffiliateProgram, markCommissionPaid } from "./actions";

function Err({ error }: { error?: string }) {
  const t = useTranslations("affiliates.errors");
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {t.has(error) ? t(error) : t("generic")}
    </p>
  );
}

export function JoinForm() {
  const t = useTranslations("affiliates");
  const [state, action] = useActionState(joinAffiliateProgram, undefined);
  const [terms, setTerms] = useState(false);
  return (
    <form action={action} className="space-y-3">
      <label className="flex items-start gap-2 text-sm leading-snug">
        <Checkbox name="terms" checked={terms} onCheckedChange={(v) => setTerms(Boolean(v))} className="mt-0.5" />
        <span>
          {t.rich("join.terms", {
            link: (chunks) => (
              <Link href="/legal/afiliados" target="_blank" className="link">
                {chunks}
              </Link>
            ),
          })}
        </span>
      </label>
      <Err error={state?.error} />
      <SubmitButton disabled={!terms} pendingLabel={t("join.joining")}>
        {t("join.submit")}
      </SubmitButton>
    </form>
  );
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const t = useTranslations("affiliates");
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} aria-label={label} className="font-mono" onFocus={(e) => e.currentTarget.select()} />
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          navigator.clipboard
            .writeText(value)
            .then(() => toast.success(t("copied")))
            .catch(() => toast.error(t("copyFailed")))
        }
      >
        <Copy className="size-4" strokeWidth={1.5} aria-hidden /> {t("copy")}
      </Button>
    </div>
  );
}

export function ClaimForm() {
  const t = useTranslations("affiliates");
  const [state, action] = useActionState(claimReferral, undefined);
  useEffect(() => {
    if (state?.ok) toast.success(t("claim.done"));
  }, [state, t]);
  if (state?.ok) return <p className="text-sm text-success">{t("claim.done")}</p>;
  return (
    <form action={action} className="space-y-2">
      <Label htmlFor="claim-code">{t("claim.label")}</Label>
      <div className="flex gap-2">
        <Input id="claim-code" name="code" maxLength={16} autoComplete="off" className="max-w-48 font-mono uppercase" placeholder="ABCD1234" />
        <SubmitButton variant="secondary" pendingLabel={t("claim.saving")}>
          {t("claim.submit")}
        </SubmitButton>
      </div>
      <Err error={state?.error} />
    </form>
  );
}

export function MarkPaidForm({ id }: { id: string }) {
  const t = useTranslations("affiliates.staff");
  const [state, action] = useActionState(markCommissionPaid, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="reference" maxLength={200} placeholder={t("reference")} aria-label={t("reference")} className="h-7 w-40 text-xs" />
      <SubmitButton size="sm" variant="secondary" pendingLabel={t("saving")}>
        {t("markPaid")}
      </SubmitButton>
      <Err error={state?.error} />
    </form>
  );
}
