"use client";

import Link from "next/link";
import { MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";
import { joinWaitlist, type WaitlistState } from "@/app/(marketing)/waitlist-actions";
import { SubmitButton } from "@/components/forms/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Formulario de la lista de espera. Contrato en `waitlist-actions.ts`:
 * email + consent ("on") obligatorios, ref opcional, website = honeypot (debe ir vacío).
 * `compact` es la versión del hero (misma lógica, menos texto).
 */
export function WaitlistForm({ refCode, compact = false }: { refCode?: string; compact?: boolean }) {
  const t = useTranslations("landing.waitlist");
  const tErr = useTranslations("errors");
  const [state, action] = useActionState<WaitlistState, FormData>(joinWaitlist, undefined);
  const id = useId();
  const ids = {
    email: `${id}-email`,
    emailErr: `${id}-email-err`,
    consent: `${id}-consent`,
    consentErr: `${id}-consent-err`,
    website: `${id}-website`,
  };

  const ok = state?.ok === true;
  const failed = state && !state.ok ? state : undefined;
  const emailError = Boolean(failed?.fieldErrors?.email?.length);
  const consentError = Boolean(failed?.fieldErrors?.consent?.length);

  const privacyLink = (chunks: React.ReactNode) => (
    <Link
      href="/legal/privacidad"
      target="_blank"
      className="font-medium text-primary-ink underline underline-offset-2 hover:no-underline"
    >
      {chunks}
    </Link>
  );

  return (
    <div className="w-full">
      {/* Región viva: anuncia el resultado a lectores de pantalla. */}
      <div aria-live="polite">
        {ok && (
          <div className="flex items-start gap-3 rounded-md border border-success/40 bg-success/10 p-4">
            <MailCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            <div className="space-y-1">
              <p className="font-semibold">{t("successTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("successBody", { email: state.email })}</p>
              <p className="text-xs text-muted-foreground">{t("unsubscribe")}</p>
            </div>
          </div>
        )}
      </div>

      {!ok && (
        <form action={action} className={cn("space-y-3", !compact && "space-y-4")}>
          <div className={cn("flex flex-col gap-2", compact && "sm:flex-row sm:items-start")}>
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor={ids.email} className={cn(compact && "sr-only")}>
                {t("email")}
              </Label>
              <Input
                id={ids.email}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder={t("emailPlaceholder")}
                defaultValue={failed?.values?.email}
                aria-invalid={emailError || undefined}
                aria-describedby={emailError ? ids.emailErr : undefined}
                className="h-11 rounded-md px-3"
              />
              {emailError && (
                <p id={ids.emailErr} className="text-xs text-destructive">
                  {t("emailInvalid")}
                </p>
              )}
            </div>
            <SubmitButton
              size="lg"
              className={cn("h-11 w-full", compact && "sm:w-auto")}
              pendingLabel={t("submitting")}
            >
              {compact ? t("submitShort") : t("submit")}
            </SubmitButton>
          </div>

          <div className="flex items-start gap-2.5">
            <Checkbox
              id={ids.consent}
              name="consent"
              required
              className="mt-0.5"
              aria-invalid={consentError || undefined}
              aria-describedby={consentError ? ids.consentErr : undefined}
            />
            <Label
              htmlFor={ids.consent}
              className={cn("block leading-snug font-normal text-muted-foreground", compact ? "text-xs" : "text-sm")}
            >
              {t.rich("consent", { privacy: privacyLink })}
            </Label>
          </div>
          {consentError && (
            <p id={ids.consentErr} className="text-xs text-destructive">
              {t("consentRequired")}
            </p>
          )}

          {/* Honeypot anti-bots: invisible para personas y lectores de pantalla. */}
          <div aria-hidden="true" className="absolute -left-[10000px] top-auto size-px overflow-hidden">
            <label htmlFor={ids.website}>{t("honeypot")}</label>
            <input id={ids.website} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
          </div>
          {refCode && <input type="hidden" name="ref" value={refCode} />}

          {failed?.error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {tErr(failed.error)}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
