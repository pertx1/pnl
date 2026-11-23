import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, KeyRound, LineChart, Sparkles, XCircle } from "lucide-react";
import type { NotificationType } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";

const ICONS: Record<NotificationType, { icon: typeof Sparkles; cls: string }> = {
  post_published: { icon: CheckCircle2, cls: "text-primary-ink" },
  post_failed: { icon: XCircle, cls: "text-destructive" },
  approval_pending: { icon: ClipboardCheck, cls: "text-foreground" },
  account_issue: { icon: AlertTriangle, cls: "text-brand-amber-ink" },
  youtube_consent_expiring: { icon: KeyRound, cls: "text-brand-amber-ink" },
  ai_done: { icon: Sparkles, cls: "text-primary-ink" },
  ai_failed: { icon: XCircle, cls: "text-destructive" },
  weekly_summary: { icon: LineChart, cls: "text-foreground" },
};

export function NotificationIcon({ type, className }: { type: NotificationType; className?: string }) {
  const { icon: Icon, cls } = ICONS[type] ?? { icon: CalendarClock, cls: "text-muted-foreground" };
  return <Icon className={cn("mt-0.5 size-4 shrink-0", cls, className)} strokeWidth={1.5} aria-hidden />;
}
