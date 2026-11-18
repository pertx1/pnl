"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import { FieldError, FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signup } from "../actions";

export function SignupForm() {
  const t = useTranslations("auth");
  const [state, action] = useActionState(signup, undefined);

  if (state?.ok) {
    return (
      <div className="space-y-3 text-center">
        <MailCheck className="mx-auto size-10 text-primary-ink" aria-hidden />
        <h1 className="text-2xl font-bold">{t("checkEmailTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("checkEmailBody", { email: state.message ?? "" })}</p>
      </div>
    );
  }

  const link = (href: string) =>
    function LegalLink(chunks: React.ReactNode) {
      return (
        <Link href={href} target="_blank" className="font-medium text-primary-ink underline-offset-2 hover:underline">
          {chunks}
        </Link>
      );
    };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t("signupTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("signupSubtitle")}</p>
      </div>
      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t("name")}</Label>
          <Input id="name" name="name" autoComplete="name" required maxLength={120} defaultValue={state?.values?.name} />
          <FieldError messages={state?.fieldErrors?.name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} />
          <FieldError messages={state?.fieldErrors?.email} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t("password")}</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
          <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox id="terms" name="terms" required className="mt-0.5" />
          <Label htmlFor="terms" className="block text-sm leading-snug font-normal">
            {t.rich("acceptTerms", { terms: link("/legal/terminos"), privacy: link("/legal/privacidad") })}
          </Label>
        </div>
        {state?.fieldErrors?.terms && <p className="text-xs text-destructive">{t("acceptTermsRequired")}</p>}
        <FormError error={state?.error} />
        <SubmitButton className="w-full" pendingLabel={t("signingUp")}>
          {t("signup")}
        </SubmitButton>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-medium text-primary-ink hover:underline">
          {t("goLogin")}
        </Link>
      </p>
    </div>
  );
}
