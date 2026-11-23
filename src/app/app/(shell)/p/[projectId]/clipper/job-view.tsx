"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, FileArchive, FileText, Palette, Scissors, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TerminalCursor } from "@/components/brand/terminal-cursor";
import { CreditCost } from "@/components/kreo/credit-cost";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { renderCredits, toSrt, type TranscriptChunk } from "@/lib/clipper/segments";
import { DEFAULT_RENDER_OPTIONS, type RenderOptions } from "@/lib/clipper/styles";
import { uniqueNames, zipStore } from "@/lib/clipper/zip";
import { checkClipJob, deleteClipJob, renderSegments } from "./actions";
import { RenderOptionsPanel } from "./render-options";
import { SchedulePanel, type ScheduleAccount } from "./schedule-panel";
import { downloadText, mmss, SegmentCard, slug, type Seg } from "./segment-card";

/** Huella del progreso (ordenada por id) para refrescar la página solo cuando algo cambia. */
const progressKey = (status: string, segs: { id: string; status: string; step: string | null }[]) =>
  `${status}|${[...segs].sort((a, b) => a.id.localeCompare(b.id)).map((s) => `${s.id}:${s.status}:${s.step}`).join(",")}`;

function Section({ icon: Icon, title, children }: { icon: typeof Palette; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-md border px-3 py-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-muted-foreground" aria-hidden /> {title}
      </h3>
      {children}
    </section>
  );
}

export function JobView({
  projectId,
  canEdit,
  enabled,
  agentsEnabled,
  balance,
  job,
  sourceUrl,
  transcript,
  segments,
  brandColors,
  accounts,
}: {
  projectId: string;
  canEdit: boolean;
  enabled: boolean;
  agentsEnabled: boolean;
  balance: number;
  job: { id: string; title: string | null; status: string; durationS: number | null; language: string | null; errorCode: string | null };
  sourceUrl: string | null;
  transcript: TranscriptChunk[];
  segments: Seg[];
  brandColors: string[];
  accounts: ScheduleAccount[];
}) {
  const t = useTranslations("clipper");
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [options, setOptions] = useState<RenderOptions>(() => ({ ...DEFAULT_RENDER_OPTIONS, accent: brandColors.find((c) => /^#[0-9a-fA-F]{6}$/.test(c)) ?? DEFAULT_RENDER_OPTIONS.accent }));
  const [error, setError] = useState<string>();
  const [zipping, setZipping] = useState(false);
  const [busy, start] = useTransition();
  const lastKey = useRef(progressKey(job.status, segments));

  const working = job.status === "transcribing" || job.status === "analyzing" || segments.some((s) => s.status === "rendering");
  const sorted = useMemo(() => [...segments].sort((a, b) => b.score - a.score), [segments]);

  // Consulta el progreso cada 6 s mientras haya algo en marcha (también lo avanza una tarea en segundo plano).
  useEffect(() => {
    if (!working) return;
    const id = setInterval(async () => {
      const res = await checkClipJob(job.id);
      if (!res) return;
      const key = progressKey(res.status, res.segments);
      if (key !== lastKey.current) router.refresh();
      lastKey.current = key;
    }, 6000);
    return () => clearInterval(id);
  }, [working, job.id, router]);

  const toRender = sorted.filter((s) => selected.includes(s.id) && (s.status === "proposed" || s.status === "failed"));
  const doneAll = sorted.filter((s) => s.status === "done" && s.assetUrl);
  const doneSelected = doneAll.filter((s) => selected.includes(s.id));
  const total = toRender.reduce((sum, s) => sum + renderCredits(s.end - s.start, options.subtitles), 0);
  const errText = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));

  /** Descarga el lote en un ZIP (sin compresión: los MP4 ya van comprimidos). */
  async function downloadZip(list: Seg[]) {
    setZipping(true);
    try {
      const names = uniqueNames(list.map((s) => `${slug(s.title)}.mp4`));
      const files: { name: string; data: Uint8Array }[] = [];
      for (let i = 0; i < list.length; i++) {
        const res = await fetch(list[i].assetUrl!);
        if (!res.ok) throw new Error("download_failed");
        files.push({ name: names[i], data: new Uint8Array(await res.arrayBuffer()) });
        if (list[i].srt) files.push({ name: names[i].replace(/\.mp4$/, ".srt"), data: new TextEncoder().encode(list[i].srt!) });
      }
      const url = URL.createObjectURL(new Blob(zipStore(files) as BlobPart[], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug(job.title ?? "clips")}-clips.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      toast.error(t("errors.download_failed"));
    } finally {
      setZipping(false);
    }
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row flex-wrap items-start gap-3 border-b px-4 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium">{job.title ?? t("untitled")}</h2>
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {t(`status.${job.status}`)}
            {job.durationS ? ` · ${mmss(job.durationS)}` : ""}
            {job.language ? ` · ${job.language.toUpperCase()}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {doneAll.length > 0 && (
            <Button variant="secondary" size="sm" disabled={zipping} onClick={() => downloadZip(doneSelected.length ? doneSelected : doneAll)}>
              <FileArchive aria-hidden /> {zipping ? t("zipping") : t("downloadAll", { n: doneSelected.length || doneAll.length })}
            </Button>
          )}
          {transcript.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => downloadText(`${slug(job.title ?? "transcript")}.srt`, toSrt(transcript))}>
              <FileText aria-hidden /> {t("downloadSrt")}
            </Button>
          )}
          {canEdit && !working && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  if (!window.confirm(t("deleteConfirm"))) return;
                  const res = await deleteClipJob(job.id);
                  if (!res.ok) {
                    toast.error(errText(res.error));
                    return;
                  }
                  router.push(`/app/p/${projectId}/clipper`);
                  router.refresh();
                })
              }
            >
              <Trash2 aria-hidden /> {t("deleteJob")}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-4 py-4">
        {(job.status === "transcribing" || job.status === "analyzing") && (
          <p role="status" className="flex items-center gap-2 rounded-md border bg-secondary/50 px-3 py-2 text-sm">
            <TerminalCursor /> {job.status === "transcribing" ? t("progress.transcribing") : t("progress.analyzing")}
          </p>
        )}
        {job.status === "failed" && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errText(job.errorCode ?? "generic")} {t("refunded")}
          </p>
        )}
        {job.status === "ready" && segments.length === 0 && <p className="text-sm text-muted-foreground">{t("noMoments")}</p>}

        {sorted.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground">{t("momentsHint")}</p>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sorted.map((s) => (
                <SegmentCard
                  key={`${s.id}:${s.start}:${s.end}:${s.status}`}
                  seg={s}
                  projectId={projectId}
                  canEdit={canEdit}
                  enabled={enabled}
                  sourceUrl={sourceUrl}
                  transcript={transcript}
                  selected={selected.includes(s.id)}
                  onToggle={(on) => setSelected((p) => (on ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                  options={options}
                  balance={balance}
                />
              ))}
            </ul>
          </>
        )}

        {canEdit && job.status === "ready" && sorted.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Section icon={Palette} title={t("styleTitle")}>
              <RenderOptionsPanel value={options} onChange={setOptions} brandColors={brandColors} />
              <p className="text-xs text-muted-foreground">{t("renderHint")}</p>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {errText(error)}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="label-mono">{t("renderCost")}</span>
                  <CreditCost credits={total} />
                  <span className="font-mono text-xs text-muted-foreground">{t("balance", { balance })}</span>
                </div>
                <Button
                  variant="brand"
                  disabled={!enabled || busy || toRender.length === 0 || balance < total}
                  onClick={() =>
                    start(async () => {
                      setError(undefined);
                      const res = await renderSegments({ jobId: job.id, segmentIds: toRender.map((s) => s.id), options });
                      if (!res.ok) {
                        setError(res.error);
                        return;
                      }
                      toast.success(t("renderStarted", { n: res.data?.started ?? 0 }));
                      setSelected((p) => p.filter((id) => !toRender.some((s) => s.id === id)));
                      router.refresh();
                    })
                  }
                >
                  <Scissors aria-hidden /> {busy ? t("starting") : `${t("render", { n: toRender.length })} · ${total}`}
                </Button>
              </div>
              {toRender.length === 0 && <p className="text-xs text-muted-foreground">{t("selectToRender")}</p>}
            </Section>

            <Section icon={CalendarClock} title={t("scheduler.title")}>
              <p className="text-xs text-muted-foreground">{t("scheduler.intro")}</p>
              {doneSelected.length ? (
                <SchedulePanel projectId={projectId} clips={doneSelected.map((s) => ({ id: s.id, title: s.title }))} accounts={accounts} balance={balance} enabled={agentsEnabled} />
              ) : (
                <p className="text-sm text-muted-foreground">{doneAll.length ? t("scheduler.selectDone") : t("scheduler.noneDone")}</p>
              )}
            </Section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
