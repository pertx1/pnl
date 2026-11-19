"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { SubmitButton } from "@/components/forms/submit-button";
import { acceptInvitation } from "./actions";

export function AcceptForm({ token }: { token: string }) {
  const t = useTranslations("invite");
  const te = useTranslations("team.errors");
  const [state, action] = useActionState(acceptInvitation, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state?.error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {te.has(state.error) ? te(state.error) : te("generic")}
        </p>
      )}
      <SubmitButton className="w-full" pendingLabel={t("accepting")}>
        {t("accept")}
      </SubmitButton>
    </form>
  );
}
