import { AppSidebar } from "@/components/app/app-sidebar";
import { countMyUnread } from "@/lib/notifications/queries";
import { getCreditBalance, getCurrentWorkspace, getPlan, getProjects, getUser, getWorkspaces } from "@/lib/server/dal";

export default async function ShellLayout({ children }: LayoutProps<"/app">) {
  const [workspace, workspaces, user] = await Promise.all([getCurrentWorkspace(), getWorkspaces(), getUser()]);
  const [projects, credits, plan, unread] = await Promise.all([
    getProjects(workspace.id),
    getCreditBalance(workspace.id),
    getPlan(workspace.planId),
    // Si la tabla aún no existe (migración sin aplicar) no rompe la app: contador a 0.
    countMyUnread().catch(() => 0),
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
        unreadNotifications={unread}
      />
      <main className="min-w-0 flex-1 px-4 pt-20 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-8 md:pt-10 md:pb-12 xl:px-12">
        <div className="animate-rise">{children}</div>
      </main>
    </div>
  );
}
