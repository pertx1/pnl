import { cookies } from "next/headers";
import { AppSidebar } from "@/components/app/app-sidebar";
import { ShellCrumb } from "@/components/app/shell-crumb";
import { countMyUnread } from "@/lib/notifications/queries";
import { parseRecentProjects, RECENT_PROJECTS_COOKIE } from "@/lib/projects/identity";
import { getCreditBalance, getCurrentWorkspace, getPlan, getProjects, getUser, getWorkspaces } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";

/** Cuenta filas por proyecto (contadores de la barra lateral y del selector de proyectos). */
function countBy(rows: { project_id: string }[] | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows ?? []) out[r.project_id] = (out[r.project_id] ?? 0) + 1;
  return out;
}

export default async function ShellLayout({ children }: LayoutProps<"/app">) {
  const [workspace, workspaces, user, supabase, jar] = await Promise.all([getCurrentWorkspace(), getWorkspaces(), getUser(), createClient(), cookies()]);
  const [projects, credits, plan, unread, { data: pendingRows }, { data: unreadRows }, { data: unreadComments }] = await Promise.all([
    getProjects(workspace.id),
    getCreditBalance(workspace.id),
    getPlan(workspace.planId),
    // Si la tabla aún no existe (migración sin aplicar) no rompe la app: contador a 0.
    countMyUnread().catch(() => 0),
    // Contadores (solo lectura, con RLS): publicaciones por aprobar y conversaciones sin leer por proyecto.
    supabase.from("posts").select("project_id").eq("workspace_id", workspace.id).eq("status", "pending_approval").limit(1000),
    // (Con error, p. ej. sin la migración de la Bandeja, `data` llega a null y el contador queda a 0.)
    supabase.from("inbox_threads").select("project_id").eq("workspace_id", workspace.id).eq("unread", true).limit(1000),
    // Comentarios de Instagram sin leer (sin la migración de comentarios, `data` llega a null y no suma).
    supabase.from("inbox_comments").select("project_id").eq("workspace_id", workspace.id).eq("unread", true).limit(1000),
  ]);

  const ids = new Set(projects.map((p) => p.id));
  const recent = parseRecentProjects(jar.get(RECENT_PROJECTS_COOKIE)?.value).filter((id) => ids.has(id));
  const pending = countBy(pendingRows);
  const unreadInbox = countBy([...(unreadRows ?? []), ...(unreadComments ?? [])]);
  const sidebarProjects = projects.map((p) => ({ id: p.id, name: p.name, pending: pending[p.id] ?? 0, unread: unreadInbox[p.id] ?? 0 }));

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        workspace={workspace}
        workspaces={workspaces}
        projects={sidebarProjects}
        recentProjectIds={recent}
        credits={credits}
        monthlyCredits={plan.monthly_credits}
        email={user?.email ?? ""}
        unreadNotifications={unread}
      />
      <main className="min-w-0 flex-1 px-4 pt-[calc(4.5rem+env(safe-area-inset-top))] pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-8 md:pt-6 md:pb-12 xl:px-12">
        <ShellCrumb projects={sidebarProjects} recentProjectIds={recent} />
        <div className="animate-rise">{children}</div>
      </main>
    </div>
  );
}
