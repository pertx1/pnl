import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRight, CalendarClock, CheckCheck } from "lucide-react";
import { StatusBadge } from "@/components/kreo/status-badge";
import { Card } from "@/components/ui/card";
import { getCurrentWorkspace, roleAtLeast } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";
import { TeamHeader, TeamNav } from "../team-nav";

export async function generateMetadata() {
  const t = await getTranslations("team.approvals");
  return { title: t("title") };
}

/** Publicaciones del workspace pendientes de aprobación (las envía un editor; las aprueba un admin en el editor). */
export default async function ApprovalsPage() {
  const t = await getTranslations("team.approvals");
  const format = await getFormatter();
  const workspace = await getCurrentWorkspace();
  const isAdmin = roleAtLeast(workspace.role, "admin");
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("posts")
    .select("id, title, caption, scheduled_at, updated_at, created_by, project_id, projects(name)")
    .eq("workspace_id", workspace.id)
    .eq("status", "pending_approval")
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .limit(100);
  const { data: members } = await supabase.rpc("team_members", { p_workspace_id: workspace.id });
  const names = new Map((members ?? []).map((m) => [m.user_id, m.full_name || m.email || ""]));
  const list = posts ?? [];

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-6">
      <TeamHeader workspaceName={workspace.name} />
      <TeamNav active="approvals" isAdmin={isAdmin} pendingCount={list.length} />
      <p className="text-sm text-muted-foreground">{isAdmin ? t("introAdmin") : t("introEditor")}</p>

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-12 text-center">
          <CheckCheck className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
        </div>
      ) : (
        <Card className="py-0">
          <ul className="divide-y divide-border">
            {list.map((p) => {
              const text = p.title || p.caption.slice(0, 120) || t("untitled");
              const author = p.created_by ? names.get(p.created_by) : null;
              return (
                <li key={p.id}>
                  <Link
                    href={`/app/p/${p.project_id}/posts/${p.id}`}
                    className="group flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium">{text}</p>
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="label-mono">{p.projects?.name ?? ""}</span>
                        {author && <span>{t("by", { name: author })}</span>}
                        <span className="inline-flex items-center gap-1 font-mono">
                          <CalendarClock className="size-3" aria-hidden />
                          {p.scheduled_at ? format.dateTime(new Date(p.scheduled_at), { dateStyle: "medium", timeStyle: "short" }) : t("noDate")}
                        </span>
                      </p>
                    </div>
                    <StatusBadge status="pending_approval" />
                    <span className="inline-flex items-center gap-1 text-sm text-primary-ink">
                      {isAdmin ? t("review") : t("open")}
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
