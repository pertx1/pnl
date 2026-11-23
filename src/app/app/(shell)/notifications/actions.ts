"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { countMyUnread, listMyNotifications } from "@/lib/notifications/queries";
import { NOTIFICATION_TYPES, type NotificationItem } from "@/lib/notifications/types";
import { requireUser } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";

/** Lista corta para el panel de la campana + contador de no leídos. */
export async function fetchNotificationsPanel(): Promise<{ items: NotificationItem[]; unread: number }> {
  await requireUser();
  const [items, unread] = await Promise.all([listMyNotifications(15), countMyUnread()]);
  return { items, unread };
}

export async function fetchUnreadCount(): Promise<number> {
  await requireUser();
  return countMyUnread();
}

const idsSchema = z.array(z.uuid()).min(1).max(100).optional();

/** Marca como leídos los indicados (o todos si no se indica ninguno). RLS + RPC: solo los propios. */
export async function markNotificationsRead(ids?: string[]): Promise<{ ok: boolean }> {
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false };
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read", { p_ids: parsed.data ?? null });
  if (error) return { ok: false };
  revalidatePath("/app/notifications");
  return { ok: true };
}

export async function deleteNotification(id: string): Promise<{ ok: boolean }> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false };
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").delete().eq("id", parsed.data);
  if (error) return { ok: false };
  revalidatePath("/app/notifications");
  return { ok: true };
}

const prefsSchema = z.array(z.enum(NOTIFICATION_TYPES)).max(NOTIFICATION_TYPES.length);

/** Guarda los tipos DESACTIVADOS del propio usuario. */
export async function saveNotificationPreferences(disabled: string[]): Promise<{ ok: boolean }> {
  const parsed = prefsSchema.safeParse([...new Set(disabled)]);
  if (!parsed.success) return { ok: false };
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("notification_preferences").upsert({ user_id: user.id, disabled_types: parsed.data, updated_at: new Date().toISOString() });
  return { ok: !error };
}
