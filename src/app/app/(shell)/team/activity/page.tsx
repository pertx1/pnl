import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { History, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPlanDef } from "@/lib/billing/plans";
import { getCurrentWorkspace, roleAtLeast } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";
import { describeActivity, KNOWN_ACTIONS } from "@/lib/team/activity";
import { TeamHeader, TeamNav } from "../team-nav";

export async function generateMetadata() {
  const t = await getTranslations("team.activity");
  return { title: t("title") };
}

const PAGE = 50;
const uuid = /^[0-9a-f-]{36}$/i;
const day = /^\d{4}-\d{2}-\d{2}$/;

type Search = { actor?: string; action?: string; from?: string; to?: string; before?: string };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const t = await getTranslations("team.activity");
  const tr = await getTranslations("team.roles");
  const format = await getFormatter();
  const workspace = await getCurrentWorkspace();
  const isAdmin = roleAtLeast(workspace.role, "admin");

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <TeamHeader workspaceName={workspace.name} />
        <TeamNav active="activity" isAdmin={false} />
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-12 text-center">
          <Lock className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          <p className="text-sm text-muted-foreground">{t("onlyAdmins")}</p>
        </div>
      </div>
    );
  }

  const actor = sp.actor && uuid.test(sp.actor) ? sp.actor : "";
  const action = sp.action && /^[a-z_]+\.[a-z_]+$/.test(sp.action) ? sp.action : "";
  const from = sp.from && day.test(sp.from) ? sp.from : "";
  const to = sp.to && day.test(sp.to) ? sp.to : "";
  const before = sp.before && /^\d+$/.test(sp.before) ? Number(sp.before) : null;

  const supabase = await createClient();
  let query = supabase
    .from("activity_log")
    .select("id, actor_id, action, entity_type, entity_id, metadata, created_at")
    .eq("workspace_id", workspace.id)
    .order("id", { ascending: false })
    .limit(PAGE + 1);
  if (actor) query = query.eq("actor_id", actor);
  if (action) query = query.eq("action", action);
  if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to) query = query.lt("created_at", new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000).toISOString());
  if (before) query = query.lt("id", before);

  const [{ data: rows }, { data: actors }, { data: members }] = await Promise.all([
    query,
    supabase.rpc("activity_actors", { p_workspace_id: workspace.id }),
    supabase.rpc("team_members", { p_workspace_id: workspace.id }),
  ]);
  const names = new Map<string, string>();
  for (const a of actors ?? []) if (a.full_name) names.set(a.user_id, a.full_name);
  for (const m of members ?? []) names.set(m.user_id, m.full_name || m.email || names.get(m.user_id) || "");
  const list = (rows ?? []).slice(0, PAGE);
  const hasMore = (rows ?? []).length > PAGE;
  const roleName = (r?: string) => (r && tr.has(r) ? tr(r) : (r ?? ""));
  const planName = (id: string) => getPlanDef(id)?.name ?? id;
  const nameOf = (id: string | null) => (id ? names.get(id) || t("formerMember") : t("system"));

  const nextParams = new URLSearchParams({ ...(actor && { actor }), ...(action && { action }), ...(from && { from }), ...(to && { to }) });
  if (list.length) nextParams.set("before", String(list[list.length - 1].id));
  const filtered = Boolean(actor || action || from || to);
  const selectCls =
    "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <TeamHeader workspaceName={workspace.name} />
      <TeamNav active="activity" isAdmin />

      <form method="get" className="grid gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto] lg:items-end" aria-label={t("filters")}>
        <div className="space-y-1.5">
          <Label htmlFor="f-actor">{t("member")}</Label>
          <select id="f-actor" name="actor" defaultValue={actor} className={selectCls}>
            <option value="">{t("all")}</option>
            {[...names.entries()].map(([id, name]) => (
              <option key={id} value={id}>
                {name || t("formerMember")}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-action">{t("action")}</Label>
          <select id="f-action" name="action" defaultValue={action} className={selectCls}>
            <option value="">{t("all")}</option>
            {KNOWN_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {t(`actionNames.${a.replace(".", "_")}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-from">{t("from")}</Label>
          <Input id="f-from" type="date" name="from" defaultValue={from} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-to">{t("to")}</Label>
          <Input id="f-to" type="date" name="to" defaultValue={to} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">
            {t("apply")}
          </Button>
          {filtered && (
            <Button asChild variant="ghost">
              <Link href="/app/team/activity">{t("clear")}</Link>
            </Button>
          )}
        </div>
      </form>

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-12 text-center">
          <History className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          <p className="text-sm text-muted-foreground">{filtered ? t("emptyFiltered") : t("empty")}</p>
        </div>
      ) : (
        <Card className="py-0">
          <ol className="divide-y divide-border">
            {list.map((r) => {
              const d = describeActivity(r);
              return (
                <li key={r.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <time dateTime={r.created_at} className="w-36 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {format.dateTime(new Date(r.created_at), { dateStyle: "short", timeStyle: "short" })}
                  </time>
                  <p className="min-w-0 flex-1 text-sm">
                    {d.known
                      ? t(`messages.${d.key}`, {
                          actor: nameOf(r.actor_id),
                          target: d.targetId ? nameOf(d.targetId) : "",
                          role: roleName(d.roleValues.role),
                          from: d.planValues.from ? planName(d.planValues.from) : roleName(d.roleValues.from),
                          to: d.planValues.to ? planName(d.planValues.to) : roleName(d.roleValues.to),
                        })
                      : t("messages.generic", { actor: nameOf(r.actor_id), action: r.action })}
                  </p>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button asChild variant="secondary">
            <Link href={`/app/team/activity?${nextParams.toString()}`}>{t("older")}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
