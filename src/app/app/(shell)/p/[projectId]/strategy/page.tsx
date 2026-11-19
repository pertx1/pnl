import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Flame, Layers } from "lucide-react";
import { PlatformIcon } from "@/components/social/platform-icon";
import { isAgentsConfigured } from "@/lib/agents/client";
import { getCreditBalance, getProject, roleAtLeast } from "@/lib/server/dal";
import { accountLabel, getProjectAccounts, loadStrategyDoc } from "@/lib/strategy/data";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { StrategyEditor } from "./strategy-editor";
import { StrategyEmpty } from "./strategy-empty";

export async function generateMetadata() {
  const t = await getTranslations("strategy");
  return { title: t("title") };
}

export default async function StrategyPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ scope?: string }> }) {
  const { projectId } = await params;
  const { scope } = await searchParams;
  const t = await getTranslations("strategy");
  const project = await getProject(projectId);
  const canEdit = roleAtLeast(project.workspace.role, "editor");
  const supabase = await createClient();

  const [accounts, { data: strategies }, { data: members }, balance] = await Promise.all([
    getProjectAccounts(supabase, projectId),
    supabase.from("strategies").select("id, social_account_id, title, updated_at").eq("project_id", projectId),
    supabase.from("workspace_members").select("user_id").eq("workspace_id", project.workspace_id),
    getCreditBalance(project.workspace_id),
  ]);
  const scopeId = scope && accounts.some((a) => a.id === scope) ? scope : null;
  const current = (strategies ?? []).find((s) => s.social_account_id === scopeId) ?? null;
  const loaded = current ? await loadStrategyDoc(supabase, current.id) : null;

  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = memberIds.length ? await supabase.from("profiles").select("id, full_name").in("id", memberIds) : { data: [] };
  const people = memberIds.map((id) => ({ id, name: profiles?.find((p) => p.id === id)?.full_name || t("roadmap.member") }));

  const postIds = loaded ? loaded.doc.milestones.flatMap((m) => m.tasks.map((x) => x.postId)).filter((x): x is string => Boolean(x)) : [];
  const { data: posts } = postIds.length ? await supabase.from("posts").select("id, status").in("id", postIds) : { data: [] };
  const postStatus = Object.fromEntries((posts ?? []).map((p) => [p.id, p.status]));

  const scopes = [
    { id: null as string | null, label: t("scope.project"), platform: null as string | null, has: (strategies ?? []).some((s) => !s.social_account_id) },
    ...accounts.map((a) => ({ id: a.id as string | null, label: accountLabel(a), platform: a.platform as string | null, has: (strategies ?? []).some((s) => s.social_account_id === a.id) })),
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-mono">{project.name}</p>
          <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link href={`/app/p/${projectId}/warmup`} className="inline-flex items-center gap-1.5 text-sm text-primary-ink underline-offset-4 hover:underline">
          <Flame className="size-4" strokeWidth={1.5} aria-hidden /> {t("warmupLink")}
        </Link>
      </div>

      <nav aria-label={t("scope.label")} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {scopes.map((s) => {
          const active = s.id === scopeId;
          return (
            <Link
              key={s.id ?? "project"}
              href={s.id ? `/app/p/${projectId}/strategy?scope=${s.id}` : `/app/p/${projectId}/strategy`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                active ? "border-primary-ink/60 bg-accent text-foreground" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {s.platform ? <PlatformIcon platform={s.platform} className="size-5 text-[8px]" /> : <Layers className="size-4" strokeWidth={1.5} aria-hidden />}
              {s.label}
              {s.has && <span className="size-1.5 rounded-full bg-primary-ink" aria-label={t("scope.hasStrategy")} />}
            </Link>
          );
        })}
      </nav>

      {loaded && current ? (
        <StrategyEditor
          key={current.updated_at}
          projectId={projectId}
          strategyId={current.id}
          scopeLabel={scopes.find((s) => s.id === scopeId)?.label ?? ""}
          accountId={scopeId}
          initial={loaded.doc}
          source={loaded.row.source}
          updatedAt={loaded.row.updated_at}
          canEdit={canEdit}
          aiReady={isAgentsConfigured()}
          balance={balance}
          people={people}
          postStatus={postStatus}
          hasActiveAccounts={accounts.some((a) => a.status === "active" && (!scopeId || a.id === scopeId))}
        />
      ) : (
        <StrategyEmpty projectId={projectId} accountId={scopeId} canEdit={canEdit} aiReady={isAgentsConfigured()} balance={balance} hasAccounts={accounts.length > 0} />
      )}
    </div>
  );
}
