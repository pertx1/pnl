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

/** Estados por los que se puede filtrar la lista del calendario (enlaces del panel del proyecto). */
export const FILTERABLE_STATUSES = ["pending_approval", "draft", "failed"] as const;
export type FilterableStatus = (typeof FILTERABLE_STATUSES)[number];
export function isFilterableStatus(s: string | undefined): s is FilterableStatus {
  return !!s && (FILTERABLE_STATUSES as readonly string[]).includes(s);
}

/** Publicaciones de un proyecto con un estado, sin límite de fechas (las más recientes primero si no tienen fecha). */
export async function getPostsByStatus(projectId: string, status: FilterableStatus): Promise<CalendarPost[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("id, project_id, title, caption, status, scheduled_at, ai_generated, post_targets(social_accounts(platform))")
    .eq("project_id", projectId)
    .eq("status", status)
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((p) => ({
    id: p.id,
    projectId: p.project_id,
    title: p.title,
    caption: p.caption,
    status: p.status,
    scheduledAt: p.scheduled_at,
    aiGenerated: p.ai_generated,
    platforms: [...new Set((p.post_targets ?? []).map((t) => t.social_accounts?.platform).filter(Boolean) as string[])],
  }));
}
