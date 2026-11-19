import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CircleCheck, CircleX, MailX } from "lucide-react";
import { KreoLogo } from "@/components/brand/logo";
import { Card, CardContent } from "@/components/ui/card";
import { appUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { CopyLink } from "./copy-link";

export const metadata = { title: "Waitlist" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-10">
      <Link href="/" aria-label="Kreo">
        <KreoLogo className="h-8" />
      </Link>
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 py-2 text-center">{children}</CardContent>
      </Card>
    </div>
  );
}

export default async function WaitlistStatusPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const t = await getTranslations("waitlistPage");

  if (code === "invalid" || code === "unsubscribed") {
    const invalid = code === "invalid";
    const Icon = invalid ? CircleX : MailX;
    return (
      <Shell>
        <Icon className="mx-auto size-10 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        <h1 className="text-[28px] leading-tight font-medium">{invalid ? t("invalidTitle") : t("unsubscribedTitle")}</h1>
        <p className="text-muted-foreground">{invalid ? t("invalidBody") : t("unsubscribedBody")}</p>
        <Link href="/" className="link text-sm font-medium">
          {t("home")}
        </Link>
      </Shell>
    );
  }

  if (!/^[A-F0-9]{8}$/.test(code)) notFound();
  const admin = createAdminClient();
  if (!admin) notFound();
  const { data } = await admin.rpc("waitlist_status", { p_code: code });
  const status = data?.[0];
  if (!status) notFound();

  const link = `${appUrl()}/?ref=${code}#waitlist`;
  return (
    <Shell>
      <CircleCheck className="mx-auto size-10 text-success" strokeWidth={1.5} aria-hidden />
      <h1 className="text-[28px] leading-tight font-medium">{t("confirmedTitle")}</h1>
      <p className="font-mono text-3xl tabular-nums">{t("position", { position: status.rank_position, total: status.total })}</p>
      <p className="text-sm text-muted-foreground">{t("referrals", { count: status.referrals })}</p>
      <div className="space-y-2 border-t pt-4 text-left">
        <h2 className="font-semibold">{t("shareTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("shareBody")}</p>
        <CopyLink link={link} copyLabel={t("copy")} copiedLabel={t("copied")} />
        <p className="text-xs text-muted-foreground">{t("ad")}</p>
      </div>
    </Shell>
  );
}
