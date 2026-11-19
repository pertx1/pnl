"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { ErrorKey } from "@/lib/server/errors";

export function MfaForm() {
  const t = useTranslations("auth_extra");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<ErrorKey>();
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    start(async () => {
      const supabase = createClient();
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp?.[0];
      if (!factor) {
        router.replace("/app");
        return;
      }
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (error) {
        setError("mfa_invalid");
        return;
      }
      router.replace("/app");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-1">
        <ShieldCheck className="size-8 text-success" aria-hidden />
        <h1 className="text-[28px] leading-tight font-medium">{t("mfaTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("mfaSubtitle")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="code">{t("code")}</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="text-center font-mono text-2xl tracking-[0.5em]"
        />
      </div>
      <FormError error={error} />
      <Button type="submit" className="w-full" disabled={pending || code.length !== 6}>
        {pending ? t("verifying") : t("verify")}
      </Button>
    </form>
  );
}
