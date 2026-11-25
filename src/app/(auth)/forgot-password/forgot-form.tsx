"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "../actions";

export function ForgotForm() {
  const t = useTranslations("auth_extra");
  const ta = useTranslations("auth");
  const [state, action] = useActionState(requestPasswordReset, undefined);

  if (state?.ok) {
    return (
      <div className="space-y-3 text-center">
        <MailCheck className="mx-auto size-10 text-success" aria-hidden />
        <p className="text-sm text-muted-foreground">{t("forgotSent", { email: state.message ?? "" })}</p>
        <Link href="/login" className="link text-sm font-medium">
          {ta("goLogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="page-title">{t("forgotTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("forgotSubtitle")}</p>
      </div>
      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{ta("email")}</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} />
        </div>
        <FormError error={state?.error} />
        <SubmitButton className="w-full" pendingLabel={t("sending")}>
          {t("sendLink")}
        </SubmitButton>
      </form>
      <p className="text-center text-sm">
        <Link href="/login" className="link font-medium">
          {ta("goLogin")}
        </Link>
      </p>
    </div>
  );
}
