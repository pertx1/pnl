import { AppSidebar } from "@/components/app/app-sidebar";
import { getCreditBalance, getCurrentWorkspace, getPlan, getProjects, getUser, getWorkspaces } from "@/lib/server/dal";

export default async function ShellLayout({ children }: LayoutProps<"/app">) {
  const [workspace, workspaces, user] = await Promise.all([getCurrentWorkspace(), getWorkspaces(), getUser()]);
  const [projects, credits, plan] = await Promise.all([
    getProjects(workspace.id),
    getCreditBalance(workspace.id),
    getPlan(workspace.planId),
  ]);

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        workspace={workspace}
        workspaces={workspaces}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        credits={credits}
        monthlyCredits={plan.monthly_credits}
        email={user?.email ?? ""}
      />
      <main className="min-w-0 flex-1 px-4 pt-20 pb-8 sm:px-8 md:pt-8">{children}</main>
    </div>
  );
}
