import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { CalendarClock, FileBarChart, Palette } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBrandKit, getProject, roleAtLeast } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";
import { DownloadForm, ScheduleForm, ScheduleRow } from "./reports-client";

export async function generateMetadata() {
  const t = await getTranslations("commerce.reports");
  return { title: t("title") };
}

export default async function ReportsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const t = await getTranslations("commerce.reports");
  const format = await getFormatter();
  const locale = await getLocale();
  const project = await getProject(projectId);
  const canEdit = roleAtLeast(project.workspace.role, "editor");
  const kit = await getBrandKit(projectId);
  const supabase = await createClient();
  const [{ data: schedules }, { data: store }] = await Promise.all([
    supabase.from("report_schedules").select("id, frequency, recipients, sender_name, locale, include_sales, show_footer, active, next_run_at, last_sent_at").eq("project_id", projectId).order("created_at"),
    supabase.from("shopify_stores").select("id").eq("project_id", projectId).maybeSingle(),
  ]);
  const colors = Array.isArray(kit.colors) ? (kit.colors as { hex?: string }[]).map((c) => c?.hex).filter((h): h is string => typeof h === "string" && /^#[0-9a-f]{3,6}$/i.test(h)) : [];
  const brandColor = colors[0] ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="label-mono">{project.name}</p>
        <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card className="md:col-span-3">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileBarChart className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              <CardTitle>{t("downloadTitle")}</CardTitle>
            </div>
            <CardDescription>{t("downloadBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <DownloadForm projectId={projectId} hasStore={!!store} defaultLocale={locale === "en" ? "en" : "es"} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              <CardTitle>{t("brandingTitle")}</CardTitle>
            </div>
            <CardDescription>{t("brandingBody")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t("logo")}</span>
              <span>{kit.logo_path ? t("logoSet") : t("logoMissing")}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t("color")}</span>
              {brandColor ? (
                <span className="inline-flex items-center gap-2 font-mono text-xs">
                  <span className="size-4 rounded-sm border" style={{ background: brandColor }} aria-hidden />
                  {brandColor.toUpperCase()}
                </span>
              ) : (
                <span>{t("colorMissing")}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("logoFormats")}</p>
            <Link href={`/app/p/${projectId}/brand-kit`} className="link text-sm">
              {t("editBrandKit")}
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <CardTitle>{t("scheduledTitle")}</CardTitle>
          </div>
          <CardDescription>{t("scheduledBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {(schedules ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              <CalendarClock className="size-6" strokeWidth={1.5} aria-hidden />
              {t("noSchedules")}
            </div>
          ) : (
            <ul className="divide-y">
              {(schedules ?? []).map((s) => (
                <ScheduleRow
                  key={s.id}
                  projectId={projectId}
                  canEdit={canEdit}
                  schedule={{
                    id: s.id,
                    frequency: s.frequency,
                    recipients: s.recipients,
                    sender: s.sender_name,
                    active: s.active,
                    nextRun: format.dateTime(new Date(s.next_run_at), { dateStyle: "medium", timeStyle: "short" }),
                    lastSent: s.last_sent_at ? format.relativeTime(new Date(s.last_sent_at)) : null,
                  }}
                />
              ))}
            </ul>
          )}
          {canEdit ? <ScheduleForm projectId={projectId} hasStore={!!store} defaultLocale={locale === "en" ? "en" : "es"} defaultSender={project.workspace.name} /> : <p className="text-sm text-muted-foreground">{t("viewerSchedules")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
