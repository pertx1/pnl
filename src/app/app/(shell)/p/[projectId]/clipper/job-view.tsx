"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CalendarPlus, Captions, Download, FileText, Loader2, Scissors, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CreditCost } from "@/components/kreo/credit-cost";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renderCredits, toSrt, type TranscriptChunk } from "@/lib/clipper/segments";
import { cn } from "@/lib/utils";
import { checkClipJob, deleteClipJob, renderSegments, updateSegment } from "./actions";

type Seg = {
  id: string;
  start: number;
  end: number;
  title: string;
  hook: string | null;
  reason: string | null;
  score: number;
  status: string;
  step: string | null;
  subtitles: boolean;
  errorCode: string | null;
  assetUrl: string | null;
  assetId: string | null;
};

/** Huella del progreso (ordenada por id) para refrescar la página solo cuando algo cambia. */
const progressKey = (status: string, segs: { id: string; status: string; step: string | null }[]) =>
  `${status}|${[...segs].sort((a, b) => a.id.localeCompare(b.id)).map((s) => `${s.id}:${s.status}:${s.step}`).join(",")}`;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/x-subrip;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s: string) => s.normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").slice(0, 60) || "clip";

export function JobView({
  projectId,
  canEdit,
  enabled,
  balance,
  job,
  sourceUrl,
  transcript,
  segments,
}: {
  projectId: string;
  canEdit: boolean;
  enabled: boolean;
  balance: number;
  job: { id: string; title: string | null; status: string; durationS: number | null; language: string | null; errorCode: string | null };
  sourceUrl: string | null;
  transcript: TranscriptChunk[];
  segments: Seg[];
}) {
  const t = useTranslations("clipper");
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [subtitles, setSubtitles] = useState(true);
  const [error, setError] = useState<string>();
  const [busy, start] = useTransition();
  const lastKey = useRef(progressKey(job.status, segments));

  const working = job.status === "transcribing" || job.status === "analyzing" || segments.some((s) => s.status === "rendering");

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

  const selectable = segments.filter((s) => s.status === "proposed" || s.status === "failed");
  const total = useMemo(
    () => segments.filter((s) => selected.includes(s.id)).reduce((sum, s) => sum + renderCredits(s.end - s.start, subtitles), 0),
    [segments, selected, subtitles],
  );
  const errText = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));

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
            <Loader2 className="size-4 animate-spin" aria-hidden /> {job.status === "transcribing" ? t("progress.transcribing") : t("progress.analyzing")}
          </p>
        )}
        {job.status === "failed" && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errText(job.errorCode ?? "generic")} {t("refunded")}
          </p>
        )}
        {job.status === "ready" && segments.length === 0 && <p className="text-sm text-muted-foreground">{t("noMoments")}</p>}

        {segments.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground">{t("momentsHint")}</p>
            <ul className="grid gap-3 md:grid-cols-2">
              {segments.map((s) => (
                <SegmentCard
                  key={s.id}
                  seg={s}
                  projectId={projectId}
                  canEdit={canEdit}
                  sourceUrl={sourceUrl}
                  transcript={transcript}
                  selected={selected.includes(s.id)}
                  onToggle={(on) => setSelected((p) => (on ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                />
              ))}
            </ul>
          </>
        )}

        {selectable.length > 0 && canEdit && (
          <div className="space-y-3 rounded-md border px-3 py-3">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={subtitles} onCheckedChange={(v) => setSubtitles(Boolean(v))} className="mt-0.5" />
              <span>
                <span className="font-medium">{t("subtitles")}</span>
                <span className="block text-xs text-muted-foreground">{t("subtitlesHint")}</span>
              </span>
            </label>
            <p className="text-xs text-muted-foreground">{t("renderHint")}</p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {errText(error)}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <div className="flex items-center gap-3">
                <span className="label-mono">{t("renderCost")}</span>
                <CreditCost credits={total} />
                <span className="font-mono text-xs text-muted-foreground">{t("balance", { balance })}</span>
              </div>
              <Button
                variant="brand"
                disabled={!enabled || busy || selected.length === 0 || balance < total}
                onClick={() =>
                  start(async () => {
                    setError(undefined);
                    const res = await renderSegments({ jobId: job.id, segmentIds: selected, subtitles });
                    if (!res.ok) {
                      setError(res.error);
                      return;
                    }
                    toast.success(t("renderStarted", { n: res.data?.started ?? 0 }));
                    setSelected([]);
                    router.refresh();
                  })
                }
              >
                <Scissors aria-hidden /> {busy ? t("starting") : `${t("render", { n: selected.length })} · ${total}`}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SegmentCard({
  seg,
  projectId,
  canEdit,
  sourceUrl,
  transcript,
  selected,
  onToggle,
}: {
  seg: Seg;
  projectId: string;
  canEdit: boolean;
  sourceUrl: string | null;
  transcript: TranscriptChunk[];
  selected: boolean;
  onToggle: (on: boolean) => void;
}) {
  const t = useTranslations("clipper");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [startS, setStartS] = useState(String(seg.start));
  const [endS, setEndS] = useState(String(seg.end));
  const [title, setTitle] = useState(seg.title);
  const [saving, startSave] = useTransition();
  const editable = canEdit && (seg.status === "proposed" || seg.status === "failed");
  const len = seg.end - seg.start;

  return (
    <li className={cn("space-y-3 rounded-md border p-3", selected && "border-primary bg-primary/5")}>
      <div className="flex items-start gap-2">
        {editable && <Checkbox checked={selected} onCheckedChange={(v) => onToggle(Boolean(v))} aria-label={t("selectMoment", { title: seg.title })} className="mt-1" />}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{seg.title}</p>
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {mmss(seg.start)}–{mmss(seg.end)} · {Math.round(len)} s
          </p>
        </div>
        <span className="rounded-sm border px-1.5 py-px font-mono text-xs tabular-nums" title={t("scoreHint")}>
          {seg.score}
        </span>
      </div>
      {seg.hook && <p className="text-sm">“{seg.hook}”</p>}
      {seg.reason && <p className="text-xs text-muted-foreground">{seg.reason}</p>}

      {seg.status === "done" && seg.assetUrl ? (
        <video src={seg.assetUrl} controls playsInline preload="metadata" className="mx-auto aspect-[9/16] max-h-[420px] rounded-md border bg-black" />
      ) : (
        sourceUrl && <video src={`${sourceUrl}#t=${seg.start},${seg.end}`} controls playsInline preload="none" className="aspect-video w-full rounded-md border bg-black" aria-label={t("previewMoment")} />
      )}

      {seg.status === "rendering" && (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> {t(`steps.${seg.step ?? "trim"}`)}
        </p>
      )}
      {seg.status === "failed" && <p className="text-xs text-destructive">{t("renderFailed")}</p>}

      {editing && editable && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor={`s-${seg.id}`} className="text-xs">
              {t("start")}
            </Label>
            <Input id={`s-${seg.id}`} type="number" step="0.1" min={0} value={startS} onChange={(e) => setStartS(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`e-${seg.id}`} className="text-xs">
              {t("end")}
            </Label>
            <Input id={`e-${seg.id}`} type="number" step="0.1" min={0} value={endS} onChange={(e) => setEndS(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor={`t-${seg.id}`} className="text-xs">
              {t("momentTitle")}
            </Label>
            <Input id={`t-${seg.id}`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="col-span-2 flex gap-2">
            <Button
              size="sm"
              disabled={saving}
              onClick={() =>
                startSave(async () => {
                  const res = await updateSegment(seg.id, { start: Number(startS), end: Number(endS), title });
                  if (!res.ok) {
                    toast.error(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : t("errors.generic"));
                    return;
                  }
                  setEditing(false);
                  router.refresh();
                })
              }
            >
              {t("save")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {editable && !editing && (
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)}>
            {t("adjust")}
          </button>
        )}
        {transcript.length > 0 && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => downloadText(`${slug(seg.title)}.srt`, toSrt(transcript, seg.start, seg.end))}
          >
            <Captions className="size-3.5" aria-hidden /> {t("segmentSrt")}
          </button>
        )}
        {seg.status === "done" && seg.assetUrl && (
          <>
            <a href={seg.assetUrl} download className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <Download className="size-3.5" aria-hidden /> {t("download")}
            </a>
            <Link href={`/app/p/${projectId}/posts/new?caption=${encodeURIComponent(seg.hook ?? seg.title)}`} className="inline-flex items-center gap-1 text-primary-ink hover:underline">
              <CalendarPlus className="size-3.5" aria-hidden /> {t("schedule")}
            </Link>
          </>
        )}
      </div>
    </li>
  );
}
