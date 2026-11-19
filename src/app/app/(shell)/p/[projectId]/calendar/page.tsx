import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { CalendarView } from "@/components/calendar/calendar-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCalendarPosts } from "@/lib/server/calendar";
import { getProject, roleAtLeast } from "@/lib/server/dal";
import { reschedulePost } from "../posts/actions";

export async function generateMetadata() {
  const t = await getTranslations("calendar");
  return { title: t("title") };
}

export default async function ProjectCalendarPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ view?: string; d?: string }> }) {
  const { projectId } = await params;
  const { view, d } = await searchParams;
  const t = await getTranslations("calendar");
  const tp = await getTranslations("posts");
  const project = await getProject(projectId);
  const posts = await getCalendarPosts({ projectId }, d);
  const canEdit = roleAtLeast(project.workspace.role, "editor");
  const v = view === "week" || view === "list" ? view : "month";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-mono">{project.name}</p>
          <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>
        </div>
        {canEdit && (
          <Button asChild>
            <Link href={`/app/p/${projectId}/posts/new`}>
              <Plus /> {tp("new")}
            </Link>
          </Button>
        )}
      </div>
      <CalendarView
        key={`${v}-${d ?? ""}`}
        posts={posts}
        view={v}
        day={d}
        reschedule={reschedulePost}
        newPostBase={canEdit ? `/app/p/${projectId}/posts/new` : undefined}
      />
      <Card>
        <CardContent>
          <h2 className="label-mono">{t("bestTimes")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("bestTimesEmpty")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
