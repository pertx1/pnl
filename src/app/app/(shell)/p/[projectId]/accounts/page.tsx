import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Mail, MessageCircleOff } from "lucide-react";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getProject, roleAtLeast } from "@/lib/server/dal";
import { adapters } from "@/lib/social";
import { PLATFORMS } from "@/lib/social/types";
import { createClient } from "@/lib/supabase/server";
import { AccountRow } from "./account-row";

export async function generateMetadata() {
  const t = await getTranslations("accounts");
  return { title: t("title") };
}

const MAX: Record<string, number> = { tiktok: 10, instagram: 25, youtube: 10 };

export default async function AccountsPage({ params, searchParams }: PageProps<"/app/p/[projectId]/accounts">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const t = await getTranslations("accounts");
  const project = await getProject(projectId);
  const canConnect = roleAtLeast(project.workspace.role, "editor");
  const isAdmin = roleAtLeast(project.workspace.role, "admin");

  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id, platform, handle, display_name, avatar_url, status, missing_scopes, daily_post_limit")
    .eq("project_id", projectId)
    .order("created_at");

  const errorKey = typeof sp.error === "string" ? sp.error : null;
  const knownErrors = ["not_configured", "denied", "invalid_state", "forbidden", "plan_limit_accounts", "no_business_account", "no_channel", "rate_limited"];
  const connected = typeof sp.connected === "string" ? Number(sp.connected) : 0;

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-6">
      <div>
        <p className="label-mono">{project.name}</p>
        <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {errorKey && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {knownErrors.includes(errorKey) ? t(`errors.${errorKey}`) : t("errors.default")}
        </p>
      )}
      {connected > 0 && (
        <p role="status" className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          {t("connected", { count: connected })}
        </p>
      )}

      <Card>
        <CardContent className="divide-y">
          {(accounts ?? []).length === 0 && <p className="py-4 text-sm text-muted-foreground">{t("empty")}</p>}
          {(accounts ?? []).map((a) => (
            <AccountRow
              key={a.id}
              account={{ ...a, max: MAX[a.platform] ?? 10 }}
              isAdmin={isAdmin}
              reconnectHref={`/api/oauth/${a.platform}/start?project=${projectId}`}
            />
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        {PLATFORMS.map((p) => {
          const configured = adapters[p].isConfigured();
          return (
            <Card key={p}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <PlatformIcon platform={p} />
                  <CardTitle>{t(`platformNames.${p}`)}</CardTitle>
                </div>
                <CardDescription>{t(`platformHints.${p}`)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Tres redes = tres botones iguales: contorno (la lima queda para una sola acción principal). */}
                {configured && canConnect ? (
                  <Button asChild variant="outline" className="w-full">
                    <a href={`/api/oauth/${p}/start?project=${projectId}`}>{t("connectTo", { platform: t(`platformNames.${p}`) })}</a>
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    {t("connectTo", { platform: t(`platformNames.${p}`) })}
                  </Button>
                )}
                {!configured && <p className="text-xs text-muted-foreground">{t("notConfigured")}</p>}
                {configured && !canConnect && <p className="text-xs text-muted-foreground">{t("viewerCannotConnect")}</p>}
                {p === "youtube" && (
                  <p className="text-xs text-muted-foreground">
                    {t("youtubeNote")}{" "}
                    <a className="link" href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">
                      {t("ytTerms")}
                    </a>{" "}
                    ·{" "}
                    <a className="link" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
                      {t("googlePrivacy")}
                    </a>
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="opacity-80">
          <CardContent className="flex items-start gap-3">
            <MessageCircleOff className="mt-0.5 size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <p className="text-sm text-muted-foreground">{t("comingSoonNote")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start gap-3">
            <Mail className="mt-0.5 size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <p className="text-sm text-muted-foreground">
              {t("emailSoon")}{" "}
              <Link href={`/app/p/${projectId}/inbox`} className="link">
                {t("emailOpenInbox")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
