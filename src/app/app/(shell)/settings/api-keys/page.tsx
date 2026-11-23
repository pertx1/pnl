import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { AppWindow, ArrowLeft, KeyRound, PlugZap, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { appUrl } from "@/lib/env";
import { RATE_LIMIT } from "@/lib/mcp/keys";
import { requireUser } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";
import { CopyField, CreateKeyForm, CreditPolicy, RevokeAppButton, RevokeKeyButton } from "./api-keys-client";

export async function generateMetadata() {
  const t = await getTranslations("commerce.apiKeys");
  return { title: t("title") };
}

export default async function ApiKeysPage() {
  const t = await getTranslations("commerce.apiKeys");
  const ta = await getTranslations("mcpOAuth.apps");
  const format = await getFormatter();
  await requireUser();
  const supabase = await createClient();
  const { data: keys } = await supabase.from("mcp_api_keys").select("id, name, prefix, created_at, last_used_at, revoked_at, allow_credit_spend, daily_credit_cap").order("created_at", { ascending: false });
  // Apps conectadas por OAuth (RLS: cada usuario ve solo las suyas).
  const { data: apps } = await supabase
    .from("mcp_oauth_grants")
    .select("id, client_name, client_host, created_at, last_used_at, allow_credit_spend, daily_credit_cap, workspaces(name)")
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(30);
  const { data: usage } = await supabase.rpc("my_mcp_credit_usage_today");
  const used = (kind: "oauth" | "api_key", id: string) => usage?.find((u) => u.source_kind === kind && u.source_id === id)?.credits ?? 0;
  const active = (keys ?? []).filter((k) => !k.revoked_at);
  const revoked = (keys ?? []).filter((k) => k.revoked_at).slice(0, 10);
  const serverUrl = `${appUrl()}/api/mcp`;
  const cli = `claude mcp add --transport http kreo ${serverUrl} --header "Authorization: Bearer <KREO_API_KEY>"`;
  const jsonConfig = JSON.stringify({ mcpServers: { kreo: { type: "http", url: serverUrl, headers: { Authorization: "Bearer <KREO_API_KEY>" } } } }, null, 2);

  return (
    <div className="mx-auto w-full max-w-[1360px] [&>*]:max-w-3xl space-y-6">
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
            <AppWindow className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <CardTitle>{ta("title")}</CardTitle>
          </div>
          <CardDescription>{ta("body")}</CardDescription>
        </CardHeader>
        <CardContent>
          {(apps ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              <AppWindow className="size-6" strokeWidth={1.5} aria-hidden />
              {ta("empty")}
            </div>
          ) : (
            <ul className="divide-y">
              {(apps ?? []).map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{a.client_name || a.client_host}</div>
                    <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      <span>{ta("workspace", { name: a.workspaces?.name ?? "—" })}</span>
                      <span>· {ta("via", { host: a.client_host })}</span>
                      <span>· {ta("connected", { when: format.dateTime(new Date(a.created_at), { dateStyle: "medium" }) })}</span>
                      <span>· {a.last_used_at ? ta("lastUsed", { when: format.relativeTime(new Date(a.last_used_at)) }) : ta("neverUsed")}</span>
                    </div>
                  </div>
                  <RevokeAppButton id={a.id} name={a.client_name || a.client_host} />
                  <CreditPolicy kind="oauth" id={a.id} allow={a.allow_credit_spend} cap={a.daily_credit_cap} usedToday={used("oauth", a.id)} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

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
                  <CreditPolicy kind="api_key" id={k.id} allow={k.allow_credit_spend} cap={k.daily_credit_cap} usedToday={used("api_key", k.id)} />
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
          <ol className="list-decimal space-y-3 pl-5">
            <li>
              <p className="font-medium">{t("stepClaudeAi")}</p>
              <ol className="mt-1 list-[lower-alpha] space-y-1 pl-5 text-muted-foreground">
                {(["a", "b", "c", "d", "e"] as const).map((k) => (
                  <li key={k}>{t(`claudeAiSteps.${k}`, { url: serverUrl })}</li>
                ))}
              </ol>
            </li>
            <li>
              <p className="font-medium">{t("stepCode")}</p>
              <CopyField value={cli} mono />
            </li>
            <li>
              <p className="font-medium">{t("stepJson")}</p>
              <CopyField label={t("header")} value="Authorization: Bearer <KREO_API_KEY>" />
              <div className="mt-2">
                <CopyField value={jsonConfig} mono multiline />
              </div>
            </li>
          </ol>
          <div>
            <p className="label-mono mb-2">{t("toolsTitle")}</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  "get_overview",
                  "get_calendar",
                  "get_free_slots",
                  "list_tasks",
                  "create_task",
                  "update_task",
                  "create_draft_post",
                  "list_scheduled_posts",
                  "generate_image",
                  "generate_video",
                  "get_generation",
                  "get_project_stats",
                  "analyze_competitor",
                  "search_products",
                  "draft_reply",
                  "list_projects",
                ] as const
              ).map((tool) => (
                <li key={tool} className="rounded-md border p-2">
                  <code className="font-mono text-xs text-foreground">{tool}</code>
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
