import { getFormatter, getNow, getTranslations } from "next-intl/server";
import { FolderLock, MailPlus, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkspaceUsage } from "@/lib/billing/usage";
import { getCurrentWorkspace, getUser, roleAtLeast } from "@/lib/server/dal";
import { leaveBlocker } from "@/lib/team/roles";
import { createClient } from "@/lib/supabase/server";
import { LimitNotice, UsageMeter } from "../billing/limit-notice";
import { InviteForm, LeaveWorkspace, MembersList, PendingInvites } from "./team-client";
import { TeamHeader, TeamNav } from "./team-nav";

export async function generateMetadata() {
  const t = await getTranslations("team");
  return { title: t("title") };
}

export default async function TeamPage() {
  const t = await getTranslations("team");
  const tp = await getTranslations("plans");
  const format = await getFormatter();
  const [workspace, user] = await Promise.all([getCurrentWorkspace(), getUser()]);
  const isAdmin = roleAtLeast(workspace.role, "admin");
  const supabase = await createClient();

  const [{ data: members }, usage, { data: invites }, { count: pendingPosts }] = await Promise.all([
    supabase.rpc("team_members", { p_workspace_id: workspace.id }),
    getWorkspaceUsage(workspace.id),
    isAdmin
      ? supabase
          .from("workspace_invitations")
          .select("id, email, role, expires_at, created_at")
          .eq("workspace_id", workspace.id)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; email: string; role: string; expires_at: string; created_at: string }[] }),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "pending_approval"),
  ]);

  const list = members ?? [];
  const ownerCount = list.filter((m) => m.role === "owner").length;
  const now = (await getNow()).getTime();

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-6">
      <TeamHeader workspaceName={workspace.name} />
      <TeamNav active="members" isAdmin={isAdmin} pendingCount={pendingPosts ?? 0} />

      {usage && (
        <div className="space-y-2">
          <div className="max-w-sm">
            <UsageMeter label={tp("limitKinds.members")} status={usage.limits.members} />
          </div>
          {isAdmin && <LimitNotice status={usage.limits.members} />}
        </div>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MailPlus className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              {t("invite.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InviteForm disabled={Boolean(usage?.limits.members.reached)} />
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="members-heading" className="space-y-3">
        <h2 id="members-heading" className="label-mono">
          {t("members.title", { n: list.length })}
        </h2>
        <MembersList
          members={list.map((m) => ({
            userId: m.user_id,
            role: m.role,
            name: m.full_name,
            email: m.email,
            joined: format.dateTime(new Date(m.joined_at), { dateStyle: "medium" }),
          }))}
          myRole={workspace.role}
          myId={user?.id ?? ""}
          ownerCount={ownerCount}
        />
      </section>

      {isAdmin && (
        <section aria-labelledby="invites-heading" className="space-y-3">
          <h2 id="invites-heading" className="label-mono">
            {t("pending.title")}
          </h2>
          <PendingInvites
            invites={(invites ?? []).map((i) => ({
              id: i.id,
              email: i.email,
              role: i.role,
              expired: new Date(i.expires_at).getTime() <= now,
              expires: format.dateTime(new Date(i.expires_at), { dateStyle: "medium" }),
            }))}
          />
        </section>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              {t("rolesHelp.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {(["owner", "admin", "editor", "viewer"] as const).map((r) => (
                <div key={r}>
                  <dt className="font-medium">{t(`roles.${r}`)}</dt>
                  <dd className="text-muted-foreground">{t(`rolesHelp.${r}`)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderLock className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              {t("projectAccess.title")}
              <Badge variant="secondary">{t("soon")}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{t("projectAccess.body")}</CardContent>
        </Card>
      </div>

      <LeaveWorkspace workspaceName={workspace.name} blocker={leaveBlocker(workspace.role, list.length, ownerCount)} />
    </div>
  );
}
