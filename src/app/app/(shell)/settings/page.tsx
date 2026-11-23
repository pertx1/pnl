import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Download, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationPrefsForm } from "@/components/notifications/notification-prefs-form";
import { getMyDisabledTypes } from "@/lib/notifications/queries";
import { requireUser } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";
import { DeleteAccountForm, MfaSection, PasswordForm, ProfileForm } from "./settings-forms";

export async function generateMetadata() {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: profile }, disabledTypes, tn] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    getMyDisabledTypes().catch(() => []),
    getTranslations("notifications.prefs"),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1360px] [&>*]:max-w-3xl space-y-6">
      <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("profile")}</CardTitle>
          <CardDescription>{t("profileBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm name={profile?.full_name ?? ""} email={user.email ?? ""} />
        </CardContent>
      </Card>

      <Card id="security" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>{t("security")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          <PasswordForm />
          <MfaSection />
        </CardContent>
      </Card>

      <Card id="notifications" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>{tn("title")}</CardTitle>
          <CardDescription>{tn("body")}</CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationPrefsForm disabled={disabledTypes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("apiKeys")}</CardTitle>
          <CardDescription>{t("apiKeysBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/app/settings/api-keys">
              <KeyRound /> {t("apiKeysOpen")}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("data")}</CardTitle>
          <CardDescription>{t("dataBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-2">
            <h3 className="font-semibold">{t("export")}</h3>
            <p className="text-sm text-muted-foreground">{t("exportBody")}</p>
            <Button asChild variant="outline">
              <a href="/app/settings/export" download>
                <Download /> {t("export")}
              </a>
            </Button>
          </div>
          <DeleteAccountForm email={user.email ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
