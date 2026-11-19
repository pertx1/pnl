import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Clapperboard, Link2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { isAgentsConfigured } from "@/lib/agents";
import { isFalConfigured } from "@/lib/ai/providers/fal";
import type { TranscriptChunk } from "@/lib/clipper/segments";
import { getCreditBalance, getProject, roleAtLeast } from "@/lib/server/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { JobView } from "./job-view";
import { UploadCard } from "./upload-card";

export const maxDuration = 60;

export async function generateMetadata() {
  const t = await getTranslations("clipper");
  return { title: t("title") };
}

export default async function ClipperPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const t = await getTranslations("clipper");
  const format = await getFormatter();
  const project = await getProject(projectId);
  const canEdit = roleAtLeast(project.workspace.role, "editor");
  const configured = isFalConfigured() && isAgentsConfigured() && Boolean(createAdminClient());
  const supabase = await createClient();

  const [{ data: jobs }, balance] = await Promise.all([
    supabase.from("clip_jobs").select("id, title, status, duration_s, declared_duration_s, created_at, error_code").eq("project_id", projectId).order("created_at", { ascending: false }).limit(12),
    getCreditBalance(project.workspace_id),
  ]);
  const requested = typeof sp.job === "string" ? sp.job : undefined;
  const current = (jobs ?? []).find((j) => j.id === requested) ?? (jobs ?? [])[0];

  let detail = null as null | {
    job: { id: string; title: string | null; status: string; durationS: number | null; language: string | null; errorCode: string | null };
    sourceUrl: string | null;
    transcript: TranscriptChunk[];
    segments: { id: string; start: number; end: number; title: string; hook: string | null; reason: string | null; score: number; status: string; step: string | null; subtitles: boolean; errorCode: string | null; assetUrl: string | null; assetId: string | null }[];
  };
  if (current) {
    const [{ data: job }, { data: segs }] = await Promise.all([
      supabase.from("clip_jobs").select("id, title, status, duration_s, language, error_code, transcript, source_asset_id").eq("id", current.id).single(),
      supabase.from("clip_segments").select("id, start_s, end_s, title, hook, reason, score, status, render_step, subtitles, error_code, asset_id").eq("job_id", current.id).order("score", { ascending: false }),
    ]);
    if (job) {
      const assetIds = [job.source_asset_id, ...(segs ?? []).map((s) => s.asset_id)].filter((x): x is string => Boolean(x));
      const { data: assets } = assetIds.length ? await supabase.from("assets").select("id, storage_path").in("id", assetIds) : { data: [] };
      const paths = (assets ?? []).map((a) => a.storage_path);
      const { data: signed } = paths.length ? await supabase.storage.from("project-media").createSignedUrls(paths, 3600) : { data: [] };
      const urlByAsset = new Map((assets ?? []).map((a) => [a.id, (signed ?? []).find((s) => s.path === a.storage_path)?.signedUrl ?? null]));
      detail = {
        job: { id: job.id, title: job.title, status: job.status, durationS: job.duration_s, language: job.language, errorCode: job.error_code },
        sourceUrl: job.source_asset_id ? (urlByAsset.get(job.source_asset_id) ?? null) : null,
        transcript: Array.isArray(job.transcript) ? (job.transcript as unknown as TranscriptChunk[]) : [],
        segments: (segs ?? []).map((s) => ({
          id: s.id,
          start: Number(s.start_s),
          end: Number(s.end_s),
          title: s.title,
          hook: s.hook,
          reason: s.reason,
          score: s.score,
          status: s.status,
          step: s.render_step,
          subtitles: s.subtitles,
          errorCode: s.error_code,
          assetId: s.asset_id,
          assetUrl: s.asset_id ? (urlByAsset.get(s.asset_id) ?? null) : null,
        })),
      };
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="label-mono">{project.name}</p>
        <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {!configured && (
        <p role="note" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {t("notConfigured")}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <UploadCard projectId={projectId} workspaceId={project.workspace_id} balance={balance} enabled={configured && canEdit} canEdit={canEdit} />
        <Card className="gap-2 border-dashed">
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Link2 className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              <span className="text-sm font-medium">{t("youtube.title")}</span>
              <span className="ml-auto rounded-sm border px-1.5 py-px text-[10px] text-muted-foreground">{t("soon")}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("youtube.body")}</p>
          </CardContent>
        </Card>
      </div>

      {(jobs ?? []).length > 1 && (
        <nav aria-label={t("historyLabel")} className="flex gap-2 overflow-x-auto pb-1">
          {(jobs ?? []).map((j) => (
            <Link
              key={j.id}
              href={`/app/p/${projectId}/clipper?job=${j.id}`}
              aria-current={j.id === current?.id ? "page" : undefined}
              className={cn("shrink-0 rounded-md border px-3 py-2 text-left text-xs", j.id === current?.id ? "border-selected bg-primary/5" : "text-muted-foreground hover:text-foreground")}
            >
              <span className="block max-w-[180px] truncate font-medium text-foreground">{j.title ?? t("untitled")}</span>
              <span className="font-mono tabular-nums">
                {format.dateTime(new Date(j.created_at), { dateStyle: "short" })} · {t(`status.${j.status}`)}
              </span>
            </Link>
          ))}
        </nav>
      )}

      {detail ? (
        <JobView key={detail.job.id} projectId={projectId} canEdit={canEdit} enabled={configured && canEdit} balance={balance} {...detail} />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Clapperboard className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <p className="font-medium">{t("empty.title")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("empty.body")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
