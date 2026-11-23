import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

const REASONS = ["invalid_client", "invalid_redirect_uri", "invalid_request", "not_configured", "expired"] as const;

export async function generateMetadata() {
  const t = await getTranslations("mcpOAuth.error");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function OAuthErrorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getTranslations("mcpOAuth.error");
  const sp = await searchParams;
  const reason = REASONS.find((r) => r === sp.reason) ?? "invalid_request";
  return (
    <div className="space-y-5">
      <ShieldAlert className="size-8 text-destructive" strokeWidth={1.5} aria-hidden />
      <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t(`reasons.${reason}`)}</p>
      <Button asChild variant="outline">
        <Link href="/app">{t("back")}</Link>
      </Button>
    </div>
  );
}
