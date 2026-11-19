import { getTranslations } from "next-intl/server";
import { CalendarView } from "@/components/calendar/calendar-view";
import { getCalendarPosts } from "@/lib/server/calendar";
import { getCurrentWorkspace } from "@/lib/server/dal";
import { reschedulePost } from "../p/[projectId]/posts/actions";

export async function generateMetadata() {
  const t = await getTranslations("calendar");
  return { title: t("globalTitle") };
}

export default async function GlobalCalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; d?: string }> }) {
  const { view, d } = await searchParams;
  const t = await getTranslations("calendar");
  const workspace = await getCurrentWorkspace();
  const posts = await getCalendarPosts({ workspaceId: workspace.id }, d);
  const v = view === "week" || view === "list" ? view : "month";
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="label-mono">{workspace.name}</p>
        <h1 className="text-[28px] leading-tight font-medium">{t("globalTitle")}</h1>
      </div>
      <CalendarView key={`${v}-${d ?? ""}`} posts={posts} view={v} day={d} reschedule={reschedulePost} showProject />
    </div>
  );
}
