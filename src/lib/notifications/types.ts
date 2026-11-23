/**
 * Tipos de aviso del centro de avisos (sin dependencias de servidor: se usa también en la UI).
 * Mantener sincronizado con `public.notification_types()` en supabase/migrations/20261124120000_notifications.sql.
 */
export const NOTIFICATION_TYPES = [
  "post_published",
  "post_failed",
  "approval_pending",
  "account_issue",
  "youtube_consent_expiring",
  "ai_done",
  "ai_failed",
  "weekly_summary",
  "post_action_needed",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(v: unknown): v is NotificationType {
  return typeof v === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(v);
}

/** Aviso tal como lo maneja la UI (forma mínima). */
export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  projectId: string | null;
};

/** Solo enlaces internos de la app (mismo criterio que el CHECK de la tabla). */
export function safeAppLink(link: string | null | undefined): string | null {
  if (!link) return null;
  return /^\/app(\/[A-Za-z0-9/_?=&.-]*)?$/.test(link) && link.length <= 300 ? link : null;
}
