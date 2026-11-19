import "server-only";
import type { CalendarPost } from "@/components/calendar/calendar-view";
import { createClient } from "@/lib/supabase/server";

/** Publicaciones de un rango amplio alrededor del día pedido (la vista agrupa por día en la zona horaria del navegador). */
export async function getCalendarPosts(filter: { projectId?: string; workspaceId?: string }, day?: string): Promise<CalendarPost[]> {
  const anchor = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T12:00:00Z`) : new Date();
  const from = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1) - 10 * 86400000).toISOString();
  const to = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1) + 10 * 86400000).toISOString();

  const supabase = await createClient();
  let q = supabase
    .from("posts")
    .select("id, project_id, title, caption, status, scheduled_at, ai_generated, projects(name), post_targets(social_accounts(platform))")
    .or(`scheduled_at.is.null,and(scheduled_at.gte.${from},scheduled_at.lt.${to})`)
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .limit(500);
  if (filter.projectId) q = q.eq("project_id", filter.projectId);
  if (filter.workspaceId) q = q.eq("workspace_id", filter.workspaceId);
  const { data } = await q;

  return (data ?? []).map((p) => ({
    id: p.id,
    projectId: p.project_id,
    projectName: p.projects?.name,
    title: p.title,
    caption: p.caption,
    status: p.status,
    scheduledAt: p.scheduled_at,
    aiGenerated: p.ai_generated,
    platforms: (p.post_targets ?? []).map((t) => t.social_accounts?.platform).filter(Boolean) as string[],
  }));
}
