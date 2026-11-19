import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft, KeyRound, PlugZap, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { appUrl } from "@/lib/env";
import { RATE_LIMIT } from "@/lib/mcp/keys";
import { requireUser } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";
import { CopyField, CreateKeyForm, RevokeKeyButton } from "./api-keys-client";

export async function generateMetadata() {
  const t = await getTranslations("commerce.apiKeys");
  return { title: t("title") };
}

export default async function ApiKeysPage() {
  const t = await getTranslations("commerce.apiKeys");
  const format = await getFormatter();
  await requireUser();
  const supabase = await createClient();
  const { data: keys } = await supabase.from("mcp_api_keys").select("id, name, prefix, created_at, last_used_at, revoked_at").order("created_at", { ascending: false });
  const active = (keys ?? []).filter((k) => !k.revoked_at);
  const revoked = (keys ?? []).filter((k) => k.revoked_at).slice(0, 10);
  const serverUrl = `${appUrl()}/api/mcp`;
  const cli = `claude mcp add --transport http kreo ${serverUrl} --header "Authorization: Bearer <KREO_API_KEY>"`;
  const jsonConfig = JSON.stringify({ mcpServers: { kreo: { type: "http", url: serverUrl, headers: { Authorization: "Bearer <KREO_API_KEY>" } } } }, null, 2);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/app/settings" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden /> {t("back")}
        </Link>
        <p className="label-mono">{t("eyebrow")}</p>
        <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <CardTitle>{t("keysTitle")}</CardTitle>
          </div>
          <CardDescription>{t("keysBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <CreateKeyForm />
          {active.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              <KeyRound className="size-6" strokeWidth={1.5} aria-hidden />
              {t("empty")}
            </div>
          ) : (
            <ul className="divide-y">
              {active.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{k.name}</div>
                    <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      <span className="font-mono">{k.prefix}…</span>
                      <span>· {t("created", { when: format.dateTime(new Date(k.created_at), { dateStyle: "medium" }) })}</span>
                      <span>· {k.last_used_at ? t("lastUsed", { when: format.relativeTime(new Date(k.last_used_at)) }) : t("neverUsed")}</span>
                    </div>
                  </div>
                  <RevokeKeyButton id={k.id} name={k.name} />
                </li>
              ))}
            </ul>
          )}
          {revoked.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">{t("revokedList", { count: revoked.length })}</summary>
              <ul className="mt-2 space-y-1">
                {revoked.map((k) => (
                  <li key={k.id}>
                    <span className="font-mono">{k.prefix}…</span> {k.name} · {t("revokedOn", { when: format.dateTime(new Date(k.revoked_at!), { dateStyle: "medium" }) })}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      <Card id="connect" className="scroll-mt-20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <PlugZap className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <CardTitle>{t("helpTitle")}</CardTitle>
          </div>
          <CardDescription>{t("helpBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          <CopyField label={t("serverUrl")} value={serverUrl} />
          <CopyField label={t("header")} value="Authorization: Bearer <KREO_API_KEY>" />
          <ol className="list-decimal space-y-3 pl-5">
            <li>
              <p className="font-medium">{t("stepCode")}</p>
              <CopyField value={cli} mono />
            </li>
            <li>
              <p className="font-medium">{t("stepJson")}</p>
              <CopyField value={jsonConfig} mono multiline />
            </li>
            <li>
              <p className="font-medium">{t("stepClaudeAi")}</p>
              <p className="text-muted-foreground">{t("stepClaudeAiBody")}</p>
            </li>
          </ol>
          <div>
            <p className="label-mono mb-2">{t("toolsTitle")}</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {(["list_projects", "get_project_stats", "create_draft_post", "list_scheduled_posts", "analyze_competitor", "search_products", "draft_reply"] as const).map((tool) => (
                <li key={tool} className="rounded-md border p-2">
                  <code className="font-mono text-xs text-primary-ink">{tool}</code>
                  <p className="text-xs text-muted-foreground">{t(`tools.${tool}`)}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border bg-secondary/40 p-3 text-xs text-muted-foreground">
            <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
              <ShieldCheck className="size-4" strokeWidth={1.5} aria-hidden /> {t("safetyTitle")}
            </p>
            <p>{t("safetyBody", { perMinute: RATE_LIMIT.perMinute, perDay: RATE_LIMIT.perDay })}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
