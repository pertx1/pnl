import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isNotificationType, safeAppLink, type NotificationItem, type NotificationType } from "./types";

/**
 * Lecturas del centro de avisos con la sesión del usuario (RLS: cada usuario ve solo los suyos y solo de los
 * workspaces de los que sigue siendo miembro).
 */
type Row = { id: string; type: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string; project_id: string | null };

function toItem(r: Row): NotificationItem | null {
  if (!isNotificationType(r.type)) return null;
  return { id: r.id, type: r.type, title: r.title, body: r.body, link: safeAppLink(r.link), readAt: r.read_at, createdAt: r.created_at, projectId: r.project_id };
}

export async function listMyNotifications(limit = 20, onlyUnread = false): Promise<NotificationItem[]> {
  const supabase = await createClient();
  let q = supabase.from("notifications").select("id, type, title, body, link, read_at, created_at, project_id").order("created_at", { ascending: false }).limit(limit);
  if (onlyUnread) q = q.is("read_at", null);
  const { data } = await q;
  return (data ?? []).map(toItem).filter((x): x is NotificationItem => x !== null);
}

export async function countMyUnread(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}

export async function getMyNotification(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, type, title, body, link, read_at, created_at, project_id, data").eq("id", id).maybeSingle();
  if (!data) return null;
  const item = toItem(data);
  return item ? { ...item, data: data.data } : null;
}

export async function getMyDisabledTypes(): Promise<NotificationType[]> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data } = await supabase.from("notification_preferences").select("disabled_types").eq("user_id", auth.user.id).maybeSingle();
  return (data?.disabled_types ?? []).filter(isNotificationType);
}
