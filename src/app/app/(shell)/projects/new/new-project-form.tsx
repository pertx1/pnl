"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProject } from "@/app/app/actions";

export function NewProjectForm({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const [state, action] = useActionState(createProject, undefined);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("new")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <div className="space-y-2">
            <Label htmlFor="name">{t("name")}</Label>
            <Input id="name" name="name" required maxLength={80} placeholder={t("namePlaceholder")} autoFocus defaultValue={state?.values?.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">
              {t("description")} <span className="text-muted-foreground">({tc("optional")})</span>
            </Label>
            <Textarea id="description" name="description" maxLength={500} placeholder={t("descriptionPlaceholder")} defaultValue={state?.values?.description} />
          </div>
          <FormError error={state?.error} />
          <SubmitButton className="w-full" pendingLabel={tc("creating")}>
            {tc("create")}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
