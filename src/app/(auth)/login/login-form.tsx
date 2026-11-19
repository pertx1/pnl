"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "../actions";

export function LoginForm({ next, callbackError }: { next?: string; callbackError?: boolean }) {
  const t = useTranslations("auth");
  const tx = useTranslations("auth_extra");
  const [state, action] = useActionState(login, undefined);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t("loginTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("loginSubtitle")}</p>
      </div>
      {callbackError && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t("callbackError")}
        </p>
      )}
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <div className="space-y-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t("password")}</Label>
            <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
              {tx("forgot")}
            </Link>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <FormError error={state?.error} />
        <SubmitButton className="w-full" pendingLabel={t("loggingIn")}>
          {t("login")}
        </SubmitButton>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link href="/signup" className="font-medium text-primary-ink hover:underline">
          {t("goSignup")}
        </Link>
      </p>
    </div>
  );
}
