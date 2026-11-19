"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { ErrorKey } from "@/lib/server/errors";
import { changePassword, deleteAccount, updateProfile } from "./actions";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [state, action] = useActionState(updateProfile, undefined);
  useEffect(() => {
    if (state?.ok) toast.success(tc("saved"));
  }, [state, tc]);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="full_name">{t("name")}</Label>
        <Input id="full_name" name="full_name" required maxLength={120} defaultValue={state?.values?.full_name ?? name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" value={email} disabled readOnly />
      </div>
      <FormError error={state?.error} />
      <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const t = useTranslations("settings");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");
  const [state, action] = useActionState(changePassword, undefined);
  useEffect(() => {
    if (state?.ok) toast.success(t("passwordUpdated"));
  }, [state, t]);
  return (
    <form action={action} className="space-y-3">
      <h3 className="font-semibold">{t("password")}</h3>
      <div className="space-y-2">
        <Label htmlFor="password">{t("newPassword")}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        <p className="text-xs text-muted-foreground">{ta("passwordHint")}</p>
      </div>
      <FormError error={state?.error} />
      <SubmitButton variant="secondary" pendingLabel={tc("saving")}>
        {tc("save")}
      </SubmitButton>
    </form>
  );
}

type Enrollment = { factorId: string; qr: string; secret: string };

export function MfaSection() {
  const t = useTranslations("settings");
  const tx = useTranslations("auth_extra");
  const tc = useTranslations("common");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<ErrorKey>();
  const [pending, start] = useTransition();

  async function refresh() {
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    setFactorId(data?.totp?.[0]?.id ?? null);
    setLoaded(true);
  }
  useEffect(() => {
    let alive = true;
    createClient()
      .auth.mfa.listFactors()
      .then(({ data }) => {
        if (!alive) return;
        setFactorId(data?.totp?.[0]?.id ?? null);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  function enroll() {
    setError(undefined);
    start(async () => {
      const supabase = createClient();
      // Limpia intentos anteriores sin verificar.
      const { data: all } = await supabase.auth.mfa.listFactors();
      for (const f of all?.all ?? []) if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Kreo ${Date.now()}` });
      if (error || !data) return setError("generic");
      setEnrollment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    });
  }

  function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollment) return;
    start(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code });
      if (error) return setError("mfa_invalid");
      setEnrollment(null);
      setCode("");
      toast.success(t("mfaEnabled"));
      await refresh();
    });
  }

  function disable() {
    if (!factorId) return;
    start(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) {
        toast.error(t("mfaNeedAal2"));
        return;
      }
      // Baja el nivel de la sesión (aal2 → aal1) para que el token refleje el cambio.
      await supabase.auth.refreshSession();
      toast.success(t("mfaDisabled"));
      await refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">{t("mfa")}</h3>
        {loaded && <Badge variant={factorId ? "default" : "outline"}>{factorId ? t("mfaOn") : t("mfaOff")}</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">{t("mfaBody")}</p>

      {enrollment ? (
        <form onSubmit={verify} className="space-y-3 rounded-md border p-4">
          <p className="text-sm">{t("mfaScan")}</p>
          {/* QR en SVG generado por Supabase (data URL). Fondo blanco para que lo lean todas las apps. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrollment.qr} alt="QR 2FA" className="size-44 rounded-md bg-white p-2" />
          <p className="text-xs text-muted-foreground">
            {t("mfaSecret")} <code className="font-mono break-all text-foreground">{enrollment.secret}</code>
          </p>
          <div className="space-y-2">
            <Label htmlFor="mfa-code">{tx("code")}</Label>
            <Input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-40 text-center font-mono text-lg tracking-[0.4em]"
            />
          </div>
          <FormError error={error} />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || code.length !== 6}>
              {pending ? tx("verifying") : tx("verify")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEnrollment(null)}>
              {tc("cancel")}
            </Button>
          </div>
        </form>
      ) : factorId ? (
        <Button variant="outline" onClick={disable} disabled={pending}>
          <ShieldOff /> {t("mfaDisable")}
        </Button>
      ) : (
        <>
          <FormError error={error} />
          <Button variant="secondary" onClick={enroll} disabled={pending || !loaded}>
            <ShieldCheck /> {t("mfaEnable")}
          </Button>
        </>
      )}
    </div>
  );
}

export function DeleteAccountForm({ email }: { email: string }) {
  const t = useTranslations("settings");
  const [state, action] = useActionState(deleteAccount, undefined);
  const [typed, setTyped] = useState("");
  const blocked = state?.error === "transfer_ownership_required";

  return (
    <form action={action} className="space-y-3 rounded-md border border-destructive/40 p-4">
      <h3 className="font-semibold text-destructive">{t("delete")}</h3>
      <p className="text-sm text-muted-foreground">{t("deleteBody")}</p>
      <div className="space-y-2">
        <Label htmlFor="confirm">{t("deleteConfirm")}</Label>
        <Input id="confirm" name="confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={email} />
      </div>
      {blocked ? (
        <p role="alert" className="text-sm text-destructive">
          {t("deleteBlocked", { names: state?.message ?? "" })}
        </p>
      ) : state?.message === "mismatch" ? (
        <p role="alert" className="text-sm text-destructive">
          {t("deleteMismatch")}
        </p>
      ) : (
        <FormError error={state?.error} />
      )}
      <SubmitButton variant="destructive" disabled={typed.trim().toLowerCase() !== email.toLowerCase()} pendingLabel={t("deleting")}>
        <Trash2 /> {t("deleteButton")}
      </SubmitButton>
    </form>
  );
}
