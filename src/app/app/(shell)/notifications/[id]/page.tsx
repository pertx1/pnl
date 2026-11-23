import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { MarkReadOnView } from "@/components/notifications/mark-read-on-view";
import { WeeklySummaryView } from "@/components/notifications/weekly-summary-view";
import { Button } from "@/components/ui/button";
import { getMyNotification } from "@/lib/notifications/queries";
import type { WeeklySummary } from "@/lib/notifications/weekly-core";
import { requireUser } from "@/lib/server/dal";

export async function generateMetadata() {
  const t = await getTranslations("notifications");
  return { title: t("title") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asWeekly(data: unknown): WeeklySummary | null {
  const s = data as Partial<WeeklySummary> | null;
  if (!s || s.version !== 1 || !s.project || !s.period || !s.posts || !s.upcoming || !s.overdueTasks || !Array.isArray(s.accounts) || !Array.isArray(s.youtube)) return null;
  return s as WeeklySummary;
}

export default async function NotificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  await requireUser();
  const n = await getMyNotification(id);
  if (!n) notFound();
  const t = await getTranslations("notifications");
  const format = await getFormatter();
  const weekly = n.type === "weekly_summary" ? asWeekly(n.data) : null;

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-6 [&>*]:max-w-3xl">
      <MarkReadOnView id={n.id} unread={!n.readAt} />
      <Button asChild variant="ghost" size="sm">
        <Link href="/app/notifications">
          <ArrowLeft /> {t("back")}
        </Link>
      </Button>
      <div>
        {weekly && <p className="label-mono">{weekly.project.name}</p>}
        <h1 className="text-[28px] leading-tight font-medium">{weekly ? t("weekly.pageTitle") : n.title}</h1>
        <p className="text-xs text-muted-foreground">
          <time dateTime={n.createdAt}>{format.dateTime(new Date(n.createdAt), { dateStyle: "medium", timeStyle: "short" })}</time>
        </p>
      </div>
      {weekly ? (
        <WeeklySummaryView s={weekly} />
      ) : (
        <div className="space-y-4">
          {n.body && <p className="text-sm">{n.body}</p>}
          {n.link && n.link !== `/app/notifications/${n.id}` && (
            <Button asChild>
              <Link href={n.link}>{t("open")}</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
