"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileVideo, Upload } from "lucide-react";
import { CreditCost } from "@/components/kreo/credit-cost";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { analysisCredits, MAX_SOURCE_S, MAX_UPLOAD_BYTES } from "@/lib/clipper/segments";
import { createClient } from "@/lib/supabase/client";
import { createClipJob } from "./actions";

/** Lee la duración del vídeo en el navegador (sin subirlo) para mostrar el coste ANTES. */
function readDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (Number.isFinite(v.duration) && v.duration > 0) resolve(v.duration);
      else reject(new Error("no_duration"));
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("no_duration"));
    };
    v.src = url;
  });
}

export function UploadCard({ projectId, workspaceId, balance, enabled, canEdit }: { projectId: string; workspaceId: string; balance: number; enabled: boolean; canEdit: boolean }) {
  const t = useTranslations("clipper");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const rightsId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [rights, setRights] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "starting">("idle");
  const [error, setError] = useState<string>();

  const credits = duration ? analysisCredits(duration) : 0;
  const ready = enabled && file && duration && rights && balance >= credits && phase === "idle";

  async function pick(f: File | undefined) {
    setError(undefined);
    setFile(null);
    setDuration(null);
    if (!f) return;
    if (f.type !== "video/mp4") return setError("only_mp4");
    if (f.size > MAX_UPLOAD_BYTES) return setError("too_big");
    try {
      const d = await readDuration(f);
      if (d > MAX_SOURCE_S) return setError("too_long");
      if (d < 20) return setError("too_short");
      setFile(f);
      setDuration(d);
    } catch {
      setError("no_duration");
    }
  }

  async function submit() {
    if (!file || !duration || !rights) return;
    setError(undefined);
    setPhase("uploading");
    try {
      const supabase = createClient();
      const path = `${workspaceId}/${projectId}/${crypto.randomUUID()}.mp4`;
      const { error: upErr } = await supabase.storage.from("project-media").upload(path, file, { contentType: "video/mp4" });
      if (upErr) throw new Error("upload_failed");
      setPhase("starting");
      const res = await createClipJob({ projectId, path, size: file.size, durationS: duration, filename: file.name, rightsConfirmed: true, idempotencyKey: crypto.randomUUID() });
      if (!res.ok) {
        // Si no se pudo registrar el trabajo, no dejamos el archivo huérfano en Storage.
        if (res.error !== "provider_error") await supabase.storage.from("project-media").remove([path]).catch(() => undefined);
        setError(res.error);
        return;
      }
      setFile(null);
      setDuration(null);
      setRights(false);
      if (inputRef.current) inputRef.current.value = "";
      router.push(`/app/p/${projectId}/clipper?job=${res.data?.jobId ?? ""}`);
      router.refresh();
    } catch {
      setError("upload_failed");
    } finally {
      setPhase("idle");
    }
  }

  const mins = duration ? Math.floor(duration / 60) : 0;
  const secs = duration ? Math.round(duration % 60) : 0;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <h2 className="font-medium">{t("upload.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("upload.body")}</p>
        </div>

        <div className="rounded-md border border-dashed p-4">
          <input ref={inputRef} id="clip-file" type="file" accept="video/mp4" className="sr-only" disabled={!enabled || phase !== "idle"} onChange={(e) => pick(e.target.files?.[0])} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" disabled={!enabled || phase !== "idle"} onClick={() => inputRef.current?.click()}>
              <Upload aria-hidden /> {t("upload.choose")}
            </Button>
            {file ? (
              <span className="inline-flex min-w-0 items-center gap-2 text-sm">
                <FileVideo className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{file.name}</span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {mins}:{String(secs).padStart(2, "0")} · {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{t("upload.limits")}</span>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2">
          <Checkbox id={rightsId} checked={rights} onCheckedChange={(v) => setRights(Boolean(v))} disabled={!canEdit} className="mt-0.5" aria-describedby={`${rightsId}-hint`} />
          <div>
            <label htmlFor={rightsId} className="text-sm font-medium">
              {t("upload.rights")}
            </label>
            <p id={`${rightsId}-hint`} className="text-xs text-muted-foreground">
              {t("upload.rightsHint")}
            </p>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.generic")}{" "}
            {error === "insufficient_credits" && (
              <a href="/app/billing" className="font-semibold underline">
                {t("buyCredits")}
              </a>
            )}
          </p>
        )}
        {phase !== "idle" && (
          <p role="status" className="text-sm text-muted-foreground">
            {phase === "uploading" ? t("upload.uploading") : t("upload.starting")}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="label-mono">{t("analysisCost")}</span>
            {duration ? <CreditCost credits={credits} /> : <span className="text-xs text-muted-foreground">{t("upload.costHint")}</span>}
            <span className="font-mono text-xs text-muted-foreground">{t("balance", { balance })}</span>
          </div>
          <Button variant="brand" disabled={!ready} onClick={submit}>
            {phase === "idle" ? `${t("upload.analyze")}${duration ? ` · ${credits}` : ""}` : t("upload.working")}
          </Button>
        </div>
        {duration && balance < credits && <p className="text-sm text-warning">{t("errors.insufficient_credits")}</p>}
      </CardContent>
    </Card>
  );
}
