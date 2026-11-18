"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWorkspace } from "../actions";

export function OnboardingForm() {
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");
  const [state, action] = useActionState(createWorkspace, undefined);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("workspaceName")}</Label>
            <Input id="name" name="name" required maxLength={80} placeholder={t("workspacePlaceholder")} autoFocus defaultValue={state?.values?.name} />
          </div>
          <FormError error={state?.error} />
          <SubmitButton className="w-full" pendingLabel={tc("creating")}>
            {t("submit")}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
