"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CalendarPlus, Captions, Download, Minus, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { TerminalCursor } from "@/components/brand/terminal-cursor";
import { CreditCost } from "@/components/kreo/credit-cost";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_CLIP_S, MIN_CLIP_S, renderCredits, toSrt, type TranscriptChunk } from "@/lib/clipper/segments";
import { CLIP_FORMATS, cropWindow, type ClipFormat, type RenderOptions } from "@/lib/clipper/styles";
import { VIRALITY_AXES, viralityTier, type ViralityBreakdown } from "@/lib/clipper/virality";
import { cn } from "@/lib/utils";
import { rerenderSegment, updateSegment } from "./actions";

export type Seg = {
  id: string;
  start: number;
  end: number;
  title: string;
  hook: string | null;
  reason: string | null;
  score: number;
  breakdown: ViralityBreakdown | null;
  status: string;
  step: string | null;
  subtitles: boolean;
  errorCode: string | null;
  assetUrl: string | null;
  downloadUrl: string | null;
  assetId: string | null;
  format: ClipFormat | null;
  srt: string | null;
};

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export const slug = (s: string) => s.normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "clip";

export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/x-subrip;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const TIER_CLASS = { high: "border-success/40 bg-success/10 text-success", mid: "border-warning/40 bg-warning/10 text-warning", low: "text-muted-foreground" } as const;

/** Insignia de viralidad con desglose desplegable (gancho, ritmo, valor, tendencia) y la frase de por qué. */
function Virality({ seg }: { seg: Seg }) {
  const t = useTranslations("clipper.virality");
  const tier = viralityTier(seg.score);
  return (
    <details className="group rounded-md border px-2.5 py-2 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <span className={cn("rounded-sm border px-1.5 py-px font-mono text-sm font-medium tabular-nums", TIER_CLASS[tier])} aria-label={t("badge", { score: seg.score })}>
          {seg.score}
        </span>
        <span className="font-medium">{t(`tier.${tier}`)}</span>
        <span className="ml-auto text-muted-foreground group-open:hidden">{t("why")}</span>
      </summary>
      <div className="mt-2 space-y-2">
        {seg.breakdown ? (
          <dl className="grid gap-1.5">
            {VIRALITY_AXES.map((k) => (
              <div key={k} className="grid grid-cols-[72px_minmax(0,1fr)_28px] items-center gap-2">
                <dt className="text-muted-foreground">{t(`axes.${k}`)}</dt>
                <dd className="h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${seg.breakdown![k]}%` }} />
                </dd>
                <dd className="text-right font-mono tabular-nums">{seg.breakdown![k]}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-muted-foreground">{t("noBreakdown")}</p>
        )}
        {seg.reason && <p>{seg.reason}</p>}
        <p className="text-muted-foreground">{t("disclaimer")}</p>
      </div>
    </details>
  );
}

/** Vídeo original del momento con la zona que se conserva al recortar (para ver si quien habla queda dentro). */
function SourcePreview({ src, seg, options }: { src: string; seg: Seg; options: RenderOptions }) {
  const t = useTranslations("clipper");
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const win = dims ? cropWindow(dims.w, dims.h, options.format, options.layout) : null;
  const cropped = win && (win.w < 0.999 || win.h < 0.999);
  return (
    <div className="relative">
      <video
        src={`${src}#t=${seg.start},${seg.end}`}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => setDims({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
        className="aspect-video w-full rounded-md border bg-black object-contain"
        aria-label={t("previewMoment")}
      />
      {cropped && win && dims && (
        // Marco de la zona que se queda (solo borde, para no tapar los controles del vídeo).
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <div className="relative max-h-full w-full" style={{ aspectRatio: `${dims.w} / ${dims.h}` }}>
            <div
              className="absolute border-2 border-dashed border-primary"
              style={{ left: `${win.x * 100}%`, top: `${win.y * 100}%`, width: `${win.w * 100}%`, height: `${win.h * 100}%` }}
            />
          </div>
        </div>
      )}
      {cropped && <p className="mt-1 text-xs text-muted-foreground">{t("cropHint", { format: options.format })}</p>}
    </div>
  );
}

export function SegmentCard({
  seg,
  projectId,
  canEdit,
  enabled,
  sourceUrl,
  transcript,
  selected,
  onToggle,
  options,
  balance,
}: {
  seg: Seg;
  projectId: string;
  canEdit: boolean;
  enabled: boolean;
  sourceUrl: string | null;
  transcript: TranscriptChunk[];
  selected: boolean;
  onToggle: (on: boolean) => void;
  options: RenderOptions;
  balance: number;
}) {
  const t = useTranslations("clipper");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [startS, setStartS] = useState(seg.start);
  const [endS, setEndS] = useState(seg.end);
  const [title, setTitle] = useState(seg.title);
  const [saving, startSave] = useTransition();
  const selectable = canEdit && seg.status !== "rendering";
  const editable = canEdit && seg.status !== "rendering";
  const isDone = seg.status === "done";
  const len = endS - startS;
  const validLen = len >= MIN_CLIP_S && len <= MAX_CLIP_S;
  const rerenderCost = renderCredits(len, options.subtitles);
  const errText = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));

  // Frases de la transcripción alrededor del momento (±15 s) para ajustar inicio y fin con el texto a la vista.
  const context = useMemo(() => transcript.filter((c) => c.e > startS - 15 && c.s < endS + 15).slice(0, 80), [transcript, startS, endS]);
  const nudge = (which: "start" | "end", d: number) => {
    const r = (n: number) => Math.max(0, Math.round(n * 10) / 10);
    if (which === "start") setStartS((v) => Math.min(r(v + d), endS - 1));
    else setEndS((v) => Math.max(r(v + d), startS + 1));
  };
  const aspect = seg.format ? CLIP_FORMATS[seg.format] : CLIP_FORMATS["9:16"];

  return (
    <li className={cn("space-y-3 rounded-md border p-3", selected && "border-selected bg-primary/5")}>
      <div className="flex items-start gap-2">
        {selectable && (
          <Checkbox checked={selected} onCheckedChange={(v) => onToggle(Boolean(v))} aria-label={t("selectMoment", { title: seg.title })} className="mt-1" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{seg.title}</p>
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {mmss(seg.start)}–{mmss(seg.end)} · {Math.round(seg.end - seg.start)} s{isDone && seg.format ? ` · ${seg.format}` : ""}
          </p>
        </div>
      </div>
      <Virality seg={seg} />
      {seg.hook && <p className="text-sm">“{seg.hook}”</p>}

      {isDone && seg.assetUrl ? (
        <video
          src={seg.assetUrl}
          controls
          playsInline
          preload="metadata"
          className="mx-auto max-h-[420px] w-auto max-w-full rounded-md border bg-black"
          style={{ aspectRatio: `${aspect.width} / ${aspect.height}` }}
        />
      ) : (
        sourceUrl && <SourcePreview src={sourceUrl} seg={seg} options={options} />
      )}

      {seg.status === "rendering" && (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <TerminalCursor /> {t(`steps.${seg.step ?? "trim"}`)}
        </p>
      )}
      {seg.status === "failed" && <p className="text-xs text-destructive">{t("renderFailed")}</p>}

      {editing && editable && (
        <div className="space-y-3 rounded-md border bg-secondary/30 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {(["start", "end"] as const).map((which) => {
              const value = which === "start" ? startS : endS;
              const setter = which === "start" ? setStartS : setEndS;
              return (
                <div key={which} className="space-y-1">
                  <Label htmlFor={`${which}-${seg.id}`} className="text-xs">
                    {t(which)}
                  </Label>
                  <div className="flex items-center gap-1">
                    <Button type="button" size="icon" variant="secondary" className="size-11 sm:size-9" onClick={() => nudge(which, -1)} aria-label={t("minusSecond", { which: t(which) })}>
                      <Minus aria-hidden />
                    </Button>
                    <Input
                      id={`${which}-${seg.id}`}
                      type="number"
                      step="0.1"
                      min={0}
                      inputMode="decimal"
                      value={value}
                      onChange={(e) => setter(Number(e.target.value))}
                      className="text-center font-mono tabular-nums"
                    />
                    <Button type="button" size="icon" variant="secondary" className="size-11 sm:size-9" onClick={() => nudge(which, 1)} aria-label={t("plusSecond", { which: t(which) })}>
                      <Plus aria-hidden />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className={cn("font-mono text-xs tabular-nums", validLen ? "text-muted-foreground" : "text-destructive")}>
            {t("duration", { s: Math.round(len * 10) / 10 })} {!validLen && `· ${t("errors.bad_range")}`}
          </p>
          {context.length > 0 && (
            <div className="space-y-1">
              <p className="label-mono">{t("transcriptAround")}</p>
              <ol className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border bg-background p-1.5 text-xs">
                {context.map((c) => {
                  const inside = c.e > startS && c.s < endS;
                  return (
                    <li key={`${c.s}-${c.e}`} className={cn("flex items-start gap-2 rounded-sm px-1.5 py-1", inside ? "bg-primary/10" : "text-muted-foreground")}>
                      <span className="shrink-0 font-mono tabular-nums">{mmss(c.s)}</span>
                      <span className="min-w-0 flex-1">{c.t}</span>
                      <span className="flex shrink-0 gap-1">
                        <button type="button" className="rounded-sm border px-1.5 py-0.5 hover:bg-accent" onClick={() => setStartS(c.s)} aria-label={t("startHereAria", { time: mmss(c.s) })}>
                          {t("startHere")}
                        </button>
                        <button type="button" className="rounded-sm border px-1.5 py-0.5 hover:bg-accent" onClick={() => setEndS(c.e)} aria-label={t("endHereAria", { time: mmss(c.e) })}>
                          {t("endHere")}
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor={`t-${seg.id}`} className="text-xs">
              {t("momentTitle")}
            </Label>
            <Input id={`t-${seg.id}`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {seg.status === "proposed" || seg.status === "failed" ? (
              <Button
                size="sm"
                disabled={saving || !validLen}
                onClick={() =>
                  startSave(async () => {
                    const res = await updateSegment(seg.id, { start: startS, end: endS, title });
                    if (!res.ok) return void toast.error(errText(res.error));
                    setEditing(false);
                    router.refresh();
                  })
                }
              >
                {t("save")}
              </Button>
            ) : null}
            {(isDone || seg.status === "failed") && (
              <Button
                size="sm"
                variant="brand"
                disabled={saving || !validLen || !enabled || balance < rerenderCost}
                onClick={() =>
                  startSave(async () => {
                    const res = await rerenderSegment({ segmentId: seg.id, start: startS, end: endS, title, options });
                    if (!res.ok) return void toast.error(errText(res.error));
                    toast.success(t("rerenderStarted"));
                    setEditing(false);
                    router.refresh();
                  })
                }
              >
                <RefreshCw aria-hidden /> {t("rerender")} · {rerenderCost}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t("cancel")}
            </Button>
            {(isDone || seg.status === "failed") && <CreditCost credits={rerenderCost} />}
          </div>
          {(isDone || seg.status === "failed") && <p className="text-xs text-muted-foreground">{t("rerenderHint")}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {editable && !editing && (
          <button type="button" className="min-h-11 text-muted-foreground hover:text-foreground sm:min-h-0" onClick={() => setEditing(true)}>
            {isDone ? t("editClip") : t("adjust")}
          </button>
        )}
        {(seg.srt || transcript.length > 0) && (
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1 text-muted-foreground hover:text-foreground sm:min-h-0"
            onClick={() => downloadText(`${slug(seg.title)}.srt`, seg.srt ?? toSrt(transcript, seg.start, seg.end))}
          >
            <Captions className="size-3.5" aria-hidden /> {t("segmentSrt")}
          </button>
        )}
        {isDone && seg.downloadUrl && (
          <>
            <a href={seg.downloadUrl} download={`${slug(seg.title)}.mp4`} className="inline-flex min-h-11 items-center gap-1 text-muted-foreground hover:text-foreground sm:min-h-0">
              <Download className="size-3.5" aria-hidden /> {t("downloadMp4")}
            </a>
            <Link href={`/app/p/${projectId}/posts/new?caption=${encodeURIComponent(seg.hook ?? seg.title)}`} className="link inline-flex min-h-11 items-center gap-1 sm:min-h-0">
              <CalendarPlus className="size-3.5" aria-hidden /> {t("manualPost")}
            </Link>
          </>
        )}
      </div>
    </li>
  );
}
