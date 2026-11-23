"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ExternalLink, FileVideo, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { PlatformOptions } from "@/lib/posts/rules";
import { DirectUploadError, uploadToYouTubeSession } from "@/lib/social/youtube-upload-browser";
import { checkDirectFile, STORAGE_MAX_BYTES, type YtDirectUpload } from "@/lib/social/youtube-upload-core";
import { completeYouTubeDirectUpload, startYouTubeDirectUpload } from "./youtube-direct-actions";

function fmtBytes(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

const sameFile = (f: File | null, d: YtDirectUpload | undefined) => Boolean(f && d && f.size === d.size_bytes && f.type === d.mime);

type Phase = { kind: "idle" } | { kind: "uploading"; sent: number } | { kind: "finishing" } | { kind: "interrupted"; error: string } | { kind: "done"; url: string };

/**
 * «Vídeo grande: subir directo a YouTube». El archivo NO se guarda en Kreo: va del navegador a YouTube por una sesión
 * reanudable que abre el servidor (el token nunca llega aquí). Solo quien puede aprobar lo sube, y solo después de
 * aprobar la publicación (approve_post, con sus límites diarios y anti-baneo).
 */
export function YouTubeDirectUpload({
  incomingFile,
  accountId,
  postId,
  status,
  options,
  savedDirect,
  otherPlatforms,
  canApprove,
  disabled,
  onChange,
  approve,
  onDone,
}: {
  accountId: string;
  postId?: string;
  /** Estado de la publicación. */
  status: string;
  options: PlatformOptions;
  /** Archivo grande elegido en «Medios»: se pasa aquí automáticamente (activa la subida directa). */
  incomingFile?: File | null;
  /** `yt_direct_upload` tal y como está guardado (lo que se aprobó). */
  savedDirect?: YtDirectUpload;
  /** Hay Instagram o TikTok en la misma publicación. */
  otherPlatforms: boolean;
  canApprove: boolean;
  disabled?: boolean;
  onChange: (p: Partial<PlatformOptions>) => void;
  /** Guarda y aprueba con approve_post. Devuelve el id del post o null si falló (el editor muestra el error). */
  approve: () => Promise<string | null>;
  onDone: (postStatus: string) => void;
}) {
  const t = useTranslations("youtubeDirect");
  const fileInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const session = useRef<{ url: string; targetId: string } | null>(null);
  const [picked, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const direct = options.yt_direct_upload;
  const [onState, setOn] = useState(Boolean(direct));
  // Un vídeo grande elegido en «Medios» llega como `incomingFile` (el editor ya guardó sus metadatos en yt_direct_upload).
  const file = picked ?? (incomingFile && direct && sameFile(incomingFile, direct) ? incomingFile : null);
  const on = onState || Boolean(direct);
  const busy = phase.kind === "uploading" || phase.kind === "finishing";

  // Aviso del navegador si se intenta cerrar o recargar a mitad de subida.
  useEffect(() => {
    if (!busy) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [busy]);
  useEffect(() => () => abort.current?.abort(), []);

  function pick(f: File | undefined) {
    if (!f) return;
    const check = checkDirectFile(f);
    if (check !== "ok") return toast.error(t(`errors.${check}`));
    setFile(f);
    session.current = null;
    setPhase({ kind: "idle" });
    onChange({ yt_direct_upload: { file_name: f.name.slice(0, 255), size_bytes: f.size, mime: f.type } });
  }

  function toggle(v: boolean) {
    setOn(v);
    if (!v) {
      setFile(null);
      session.current = null;
      onChange({ yt_direct_upload: undefined });
    }
  }

  const approved = ["approved", "scheduled", "publishing"].includes(status);
  // Hay que (re)aprobar si no está aprobada o si el archivo elegido no es el que se aprobó.
  const needsApproval = !approved || !sameFile(file, savedDirect);

  async function run(resume: boolean) {
    if (!file) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      let s = resume ? session.current : null;
      if (!s) {
        let id = postId ?? null;
        if (needsApproval) {
          id = await approve(); // aprobación humana explícita, con todas las comprobaciones de approve_post
          if (!id) return;
        }
        if (!id) return toast.error(t("errors.not_found"));
        const res = await startYouTubeDirectUpload(id, accountId, file.size, file.type);
        if (!res.ok) {
          setPhase({ kind: "idle" });
          return toast.error(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : t("errors.generic"));
        }
        s = { url: res.sessionUrl, targetId: res.targetId };
        session.current = s;
      }
      setPhase({ kind: "uploading", sent: 0 });
      const videoId = await uploadToYouTubeSession({
        sessionUrl: s.url,
        file,
        resume,
        signal: ctrl.signal,
        onProgress: (sent) => setPhase({ kind: "uploading", sent }),
      });
      setPhase({ kind: "finishing" });
      const done = await completeYouTubeDirectUpload(s.targetId, videoId);
      if (!done.ok) {
        setPhase({ kind: "idle" });
        return toast.error(t.has(`errors.${done.error}`) ? t(`errors.${done.error}`) : t("errors.generic"));
      }
      session.current = null;
      setPhase({ kind: "done", url: done.url });
      if (done.warnings.length) toast.warning(t("doneWarnings"));
      else toast.success(done.status === "scheduled_on_platform" ? t("doneScheduled") : t("donePublished"));
      onDone(done.status);
    } catch (e) {
      const key = e instanceof DirectUploadError ? e.key : "generic";
      if (key === "expired") session.current = null; // hay que abrir otra sesión y empezar de cero
      if (key === "interrupted" && session.current) return setPhase({ kind: "interrupted", error: key });
      setPhase({ kind: "idle" });
      toast.error(t(`errors.${key}`));
    } finally {
      abort.current = null;
    }
  }

  const pct = file && phase.kind === "uploading" ? Math.min(100, Math.floor((phase.sent / file.size) * 100)) : 0;

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3 text-sm">
      <label className="flex items-center justify-between gap-2">
        <span className="font-medium">{t("toggle")}</span>
        <Switch checked={on} disabled={disabled || busy} onCheckedChange={(v) => toggle(Boolean(v))} />
      </label>
      <p className="text-[11px] text-muted-foreground">{t("toggleHint")}</p>

      {on && (
        <div className="space-y-2">
          <input
            ref={fileInput}
            type="file"
            accept="video/*"
            className="sr-only"
            aria-label={t("pick")}
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="secondary" disabled={disabled || busy} onClick={() => fileInput.current?.click()}>
              <FileVideo /> {file || direct ? t("change") : t("pick")}
            </Button>
            {(file || direct) && (
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                {t("file", { name: file?.name ?? direct!.file_name, size: fmtBytes(file?.size ?? direct!.size_bytes) })}
              </span>
            )}
          </div>
          {direct && !file && <p className="text-[11px] text-warning">{t("repick", { name: direct.file_name, size: fmtBytes(direct.size_bytes) })}</p>}
          {file && file.size <= STORAGE_MAX_BYTES && <p className="text-[11px] text-muted-foreground">{t("smallFile")}</p>}

          {otherPlatforms && (
            <p className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
              <AlertTriangle className="size-4 shrink-0" aria-hidden /> {t("otherPlatforms")}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">{t("lengthLimit")}</p>
          <p className="text-[11px] text-muted-foreground">{t("scheduleNative")}</p>

          {!canApprove ? (
            <p className="rounded-md bg-secondary/60 p-2 text-xs">{t("needsApprover")}</p>
          ) : (
            <div className="space-y-2">
              {phase.kind === "uploading" || phase.kind === "finishing" ? (
                <div className="space-y-1" role="status" aria-live="polite">
                  <div className="h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                    <div className="h-full bg-primary transition-[width]" style={{ width: `${phase.kind === "finishing" ? 100 : pct}%` }} />
                  </div>
                  <p className="font-mono text-xs">
                    {phase.kind === "finishing" ? t("finishing") : t("progress", { sent: fmtBytes(phase.sent), total: fmtBytes(file!.size), pct })}
                  </p>
                  <p className="text-xs text-warning">{t("dontClose")}</p>
                  {phase.kind === "uploading" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(t("cancelConfirm"))) {
                          abort.current?.abort();
                          session.current = null;
                        }
                      }}
                    >
                      <X /> {t("cancel")}
                    </Button>
                  )}
                </div>
              ) : phase.kind === "done" ? (
                <a href={phase.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline">
                  <ExternalLink className="size-3" aria-hidden /> {t("open")}
                </a>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {phase.kind === "interrupted" && (
                    <Button type="button" size="sm" disabled={disabled} onClick={() => run(true)}>
                      <Upload /> {t("resume")}
                    </Button>
                  )}
                  <Button type="button" size="sm" variant={phase.kind === "interrupted" ? "secondary" : "default"} disabled={disabled || !file} onClick={() => run(false)}>
                    <Upload /> {needsApproval ? t("approveAndUpload") : t("upload")}
                  </Button>
                </div>
              )}
              {phase.kind === "interrupted" && <p className="text-xs text-destructive">{t("errors.interrupted")}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
