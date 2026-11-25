import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { MarkReadOnView } from "@/components/notifications/mark-read-on-view";
import { WeeklySummaryView } from "@/components/notifications/weekly-summary-view";
import { Button } from "@/components/ui/button";
import { getMyNotification } from "@/lib/notifications/queries";
import { hydrateYouTube, type WeeklySummary } from "@/lib/notifications/weekly-core";
import { requireUser } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";

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

/**
 * YouTube no se guarda en el aviso (plazos de sus Developer Policies): nombre del canal y suscriptores se leen ahora,
 * con RLS, de la cuenta conectada y de su última cifra guardada.
 */
async function withLiveYouTube(s: WeeklySummary): Promise<WeeklySummary> {
  const ids = s.youtube.map((y) => y.id).filter((id) => UUID.test(id)).slice(0, 20);
  if (!ids.length) return { ...s, youtube: [] };
  const supabase = await createClient();
  const [{ data: accounts }, { data: rows }] = await Promise.all([
    supabase.from("social_accounts").select("id, platform, handle, display_name, status").in("id", ids),
    supabase.from("account_metrics_daily").select("social_account_id, day, followers").in("social_account_id", ids).order("day", { ascending: false }).limit(200),
  ]);
  const latest = new Map<string, number | null>();
  for (const r of rows ?? []) if (!latest.has(r.social_account_id) && r.followers !== null) latest.set(r.social_account_id, Number(r.followers));
  return hydrateYouTube(s, accounts ?? [], latest);
}

export default async function NotificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  await requireUser();
  const n = await getMyNotification(id);
  if (!n) notFound();
  const t = await getTranslations("notifications");
  const format = await getFormatter();
  const stored = n.type === "weekly_summary" ? asWeekly(n.data) : null;
  const weekly = stored ? await withLiveYouTube(stored) : null;

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
        <h1 className="page-title">{weekly ? t("weekly.pageTitle") : n.title}</h1>
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
