import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MailCheck, MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getUser } from "@/lib/server/dal";
import { isValidInviteToken } from "@/lib/team/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { AcceptForm } from "./accept-form";

export async function generateMetadata() {
  const t = await getTranslations("invite");
  return { title: t("metaTitle") };
}

/**
 * Página pública de invitación. Muestra a qué workspace te invitan (con el email enmascarado) y permite
 * aceptar si has iniciado sesión con el email invitado; si no, enlaza a login (con vuelta aquí) o a registro.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("invite");
  const tr = await getTranslations("team.roles");

  const valid = isValidInviteToken(token);
  const admin = valid ? createAdminClient() : null;
  const { data } = admin ? await admin.rpc("invitation_preview", { p_token: token }) : { data: null };
  const preview = data?.[0] ?? null;
  const user = await getUser();

  if (!valid || (admin && !preview) || (preview && preview.status !== "pending")) {
    const reason = !preview ? "invalid" : preview.status;
    return (
      <div className="space-y-4 text-center">
        <MailWarning className="mx-auto size-8 text-warning" strokeWidth={1.5} aria-hidden />
        <h1 className="text-xl font-medium">{t(`status.${reason}.title`)}</h1>
        <p className="text-sm text-muted-foreground">{t(`status.${reason}.body`)}</p>
        <Button asChild variant="secondary">
          <Link href={user ? "/app" : "/"}>{user ? t("goToApp") : t("goHome")}</Link>
        </Button>
      </div>
    );
  }

  const loginHref = `/login?next=${encodeURIComponent(`/app/team/accept/${token}`)}`;
  return (
    <div className="space-y-5">
      <div className="space-y-2 text-center">
        <MailCheck className="mx-auto size-8 text-primary-ink" strokeWidth={1.5} aria-hidden />
        <p className="label-mono">{t("eyebrow")}</p>
        <h1 className="text-xl font-medium">
          {preview ? t("title", { workspace: preview.workspace_name }) : t("titleGeneric")}
        </h1>
        {preview && (
          <p className="text-sm text-muted-foreground">
            {t("body", { inviter: preview.inviter_name || t("someone"), role: tr(preview.role) })}
          </p>
        )}
        {preview && <p className="font-mono text-xs text-muted-foreground">{t("forEmail", { email: preview.email_hint })}</p>}
      </div>

      {user ? (
        <div className="space-y-3">
          <p className="text-center text-xs text-muted-foreground">{t("signedInAs", { email: user.email ?? "" })}</p>
          <AcceptForm token={token} />
          <form action="/auth/signout" method="post" className="text-center text-xs text-muted-foreground">
            {t("wrongAccount")}{" "}
            <button type="submit" className="text-primary-ink hover:underline">
              {t("signOut")}
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-3">
          <Button asChild className="w-full">
            <Link href={loginHref}>{t("login")}</Link>
          </Button>
          <Button asChild variant="secondary" className="w-full">
            <Link href="/signup">{t("signup")}</Link>
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("signupHint")}</p>
        </div>
      )}
    </div>
  );
}
