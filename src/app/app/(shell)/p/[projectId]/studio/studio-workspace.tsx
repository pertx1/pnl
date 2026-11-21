"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AudioLines, Download, Film, ImageIcon, Palette, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { TerminalCursor } from "@/components/brand/terminal-cursor";
import { cn } from "@/lib/utils";
import { checkGeneration, startGeneration } from "./actions";
import { AudioForm, type VoiceOption } from "./audio-form";

type Model = {
  id: string;
  kind: "image" | "video";
  label: string;
  tagline: { es: string; en: string };
  tier: "budget" | "balanced" | "premium";
  usdPerUnit: number;
  durations: number[];
  needsImage: boolean;
  modelPage: string;
  creditsByDuration: Record<string, number>;
};
type Asset = { id: string; url: string | null; mime: string; ai: boolean };
type Pending = { id: string; aspect: string; kind: string };
type Kind = "image" | "video" | "audio";

const ASPECTS = ["9:16", "1:1", "4:5", "16:9"] as const;
type Aspect = (typeof ASPECTS)[number];

/** Píldora de selección: un <select> nativo (accesible y fiable) con aspecto de chip. */
function Pill({ label, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="relative inline-flex">
      <span className="sr-only">{label}</span>
      <select
        {...props}
        className="h-9 max-w-[14rem] cursor-pointer appearance-none truncate rounded-full border bg-secondary/60 py-0 pr-7 pl-3 text-[13px] font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {children}
      </select>
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[10px] text-muted-foreground">
        ▾
      </span>
    </label>
  );
}

export function StudioWorkspace({
  projectId,
  balance,
  enabled,
  pending: initialPending,
  assets,
  models,
  audio,
}: {
  projectId: string;
  balance: number;
  enabled: boolean;
  pending: Pending[];
  assets: Asset[];
  models: Model[];
  audio: { enabled: boolean; voices: VoiceOption[] };
}) {
  const t = useTranslations("studio");
  const tb = useTranslations("billing");
  const ta = useTranslations("studioAudio");
  const locale = useLocale() as "es" | "en";
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("image");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [modelId, setModelId] = useState(models.find((m) => m.kind === "image")?.id ?? "");
  const [duration, setDuration] = useState<number>(5);
  const [sourceId, setSourceId] = useState<string>();
  const [brand, setBrand] = useState(true);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<Pending[]>(initialPending);
  const [busy, start] = useTransition();
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const model = models.find((m) => m.id === modelId);
  const credits = model ? (model.kind === "video" ? model.creditsByDuration[String(duration)] : model.creditsByDuration["0"]) ?? 0 : 0;
  const ready = enabled && prompt.trim().length >= 3 && Boolean(model) && balance >= credits && (!model?.needsImage || Boolean(sourceId));
  const images = assets.filter((a) => a.mime.startsWith("image/"));
  const shown = assets.filter((a) => (kind === "audio" ? a.mime.startsWith("audio/") : kind === "video" ? a.mime.startsWith("video/") : a.mime.startsWith("image/")));
  const shownPending = pending.filter((p) => p.kind === kind);

  // Consulta las generaciones en cola (imagen o vídeo) cada 4 s hasta que terminan.
  useEffect(() => {
    if (!pending.length) return;
    const id = setInterval(async () => {
      for (const g of pending) {
        const res = await checkGeneration(g.id);
        if (res.status === "pending") continue;
        setPending((p) => p.filter((x) => x.id !== g.id));
        if (res.status === "done") toast.success(t("videoDone"));
        else toast.error(t("videoFailed"));
        router.refresh();
      }
    }, 4000);
    return () => clearInterval(id);
  }, [pending, router, t]);

  function switchKind(k: Kind) {
    setKind(k);
    setError(undefined);
    if (k === "audio") return;
    const first = models.find((m) => m.kind === k);
    setModelId(first?.id ?? "");
    setDuration(first?.durations[0] ?? 5);
  }

  function generate() {
    if (!ready || busy) return;
    start(async () => {
      setError(undefined);
      const res = await startGeneration({
        projectId,
        modelId,
        prompt,
        aspect,
        duration: model?.kind === "video" ? duration : undefined,
        sourceAssetId: model?.needsImage ? sourceId : undefined,
        useBrandColors: brand,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!res.ok) return setError(res.error);
      if (res.status === "pending") setPending((p) => [{ id: res.generationId, aspect: model?.needsImage ? "9:16" : aspect, kind: model?.kind ?? "image" }, ...p]);
      else toast.success(t("generated"));
      setPrompt("");
      router.refresh();
    });
  }

  const tabs = [
    ["image", ImageIcon, t("tabImage")],
    ["video", Film, t("tabVideo")],
    ["audio", AudioLines, ta("tab")],
  ] as const;

  return (
    <div className="space-y-5 pb-56 md:pb-44">
      {/* Cabecera compacta: título a la izquierda, tipo de contenido a la derecha. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div role="tablist" aria-label={t("filterLabel")} className="flex gap-1 rounded-full border bg-secondary/40 p-1">
          {tabs.map(([k, Icon, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => switchKind(k)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors",
                kind === k ? "bg-background text-foreground shadow-[inset_0_0_0_1px_var(--border-strong)]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4", kind === k && "text-primary-ink")} strokeWidth={1.75} aria-hidden /> {label}
            </button>
          ))}
        </div>
      </div>

      {kind === "audio" && (
        <div className="surface rounded-xl p-4 sm:p-5">
          <AudioForm projectId={projectId} balance={balance} enabled={audio.enabled} voices={audio.voices} />
        </div>
      )}

      {/* Galería a pantalla completa, en columnas (cada pieza mantiene su formato real). */}
      {shown.length === 0 && shownPending.length === 0 ? (
        <div className="bg-dots flex min-h-[46vh] flex-col items-center justify-center gap-4 rounded-xl border border-dashed px-6 py-12 text-center">
          <Sparkles className="size-7 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          <div className="space-y-1">
            <p className="text-lg font-medium">{t("emptyTitle")}</p>
            <p className="text-sm text-muted-foreground">{kind === "audio" ? t("galleryEmpty") : t("emptyBody")}</p>
          </div>
          {kind !== "audio" && (
            <div className="flex max-w-3xl flex-wrap justify-center gap-2">
              {(t.raw("examples") as string[]).map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setPrompt(ex);
                    promptRef.current?.focus();
                  }}
                  className="rounded-full border bg-background px-3 py-1.5 text-left text-[13px] text-muted-foreground hover:border-border-strong hover:text-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="-mx-4 grid grid-cols-2 gap-1 sm:-mx-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {shownPending.map((p) => (
            <div key={p.id} role="status" className="bg-dots flex aspect-[4/5] flex-col items-center justify-center gap-2 bg-secondary/50 text-sm text-muted-foreground">
              <TerminalCursor className="text-primary-ink" />
              {t("tileGenerating")}
              <span className="font-mono text-[11px]">{p.aspect}</span>
            </div>
          ))}
          {shown.map((a) => (
            <figure key={a.id} className="group relative aspect-[4/5] overflow-hidden bg-secondary">
              {a.url &&
                (a.mime.startsWith("audio/") ? (
                  <div className="flex size-full flex-col items-center justify-center gap-3 p-3">
                    <AudioLines className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                    <audio src={a.url} controls preload="none" className="w-full" aria-label={ta("audioAsset")} />
                  </div>
                ) : a.mime.startsWith("video/") ? (
                  <video src={a.url} className="size-full object-cover" controls muted playsInline preload="metadata" />
                ) : (
                  <a href={a.url} target="_blank" rel="noreferrer" className="block size-full" aria-label={t("openImage")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.url}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
                    />
                  </a>
                ))}
              {!a.mime.startsWith("audio/") && (
                <figcaption className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/60 to-transparent p-2 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                  {a.ai ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 font-mono text-[10px] tracking-wide text-white uppercase">
                      <Sparkles className="size-3" aria-hidden /> IA
                    </span>
                  ) : (
                    <span />
                  )}
                  {a.url && (
                    <a
                      href={a.url}
                      download
                      className="pointer-events-auto grid size-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      aria-label={t("download")}
                    >
                      <Download className="size-4" />
                    </a>
                  )}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}

      {/* Barra de generación flotante (imagen y vídeo). En móvil queda por encima de la barra de pestañas. */}
      {kind !== "audio" && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-3 md:bottom-5 md:left-64 md:px-6">
          <section
            aria-label={t("composerLabel")}
            className="pointer-events-auto w-full max-w-4xl rounded-2xl border border-border-strong bg-popover/95 p-2.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.55)] backdrop-blur-md"
          >
            {model?.needsImage && (
              <div className="mb-2 flex items-center gap-2 overflow-x-auto px-1 pb-1">
                <span className="label-mono shrink-0">{t("sourcePick")}</span>
                {images.length === 0 ? (
                  <span className="text-xs text-muted-foreground">{t("noImages")}</span>
                ) : (
                  images.slice(0, 20).map((img) => (
                    <button
                      type="button"
                      key={img.id}
                      onClick={() => setSourceId(img.id)}
                      aria-pressed={sourceId === img.id}
                      className={cn("size-11 shrink-0 overflow-hidden rounded-md border-2", sourceId === img.id ? "border-selected" : "border-transparent opacity-70 hover:opacity-100")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {img.url && <img src={img.url} alt="" className="size-full object-cover" />}
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="flex items-end gap-2">
              <textarea
                ref={promptRef}
                id="prompt"
                aria-label={t("prompt")}
                rows={2}
                maxLength={1500}
                value={prompt}
                disabled={!enabled || busy}
                placeholder={kind === "image" ? t("promptPlaceholderImage") : t("promptPlaceholderVideo")}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    generate();
                  }
                }}
                className="max-h-40 min-h-[2.75rem] flex-1 sm:min-h-[3.25rem] resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/80 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={generate}
                disabled={!ready || busy}
                className="flex h-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary px-4 sm:h-14 text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 sm:px-7"
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {busy ? <TerminalCursor /> : <Sparkles className="size-4" aria-hidden />}
                  {busy ? t("generating") : t("generate")}
                </span>
                <span className="font-mono text-[11px] tabular-nums opacity-80">{credits} cr</span>
              </button>
            </div>

            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto border-t pt-2 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&>*]:shrink-0">
              <Pill
                label={t("model")}
                value={modelId}
                disabled={!enabled || busy}
                onChange={(e) => {
                  const m = models.find((x) => x.id === e.target.value);
                  setModelId(e.target.value);
                  if (m?.durations.length) setDuration(m.durations[0]);
                }}
              >
                {models
                  .filter((m) => m.kind === kind)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} · {t(`tiers.${m.tier}`)}
                    </option>
                  ))}
              </Pill>
              {!model?.needsImage && (
                <Pill label={t("aspect")} value={aspect} disabled={!enabled || busy} onChange={(e) => setAspect(e.target.value as Aspect)}>
                  {ASPECTS.map((a) => (
                    <option key={a} value={a}>
                      {t(`aspects.${a}`)}
                    </option>
                  ))}
                </Pill>
              )}
              {model?.kind === "video" && (
                <Pill label={t("duration")} value={duration} disabled={!enabled || busy} onChange={(e) => setDuration(Number(e.target.value))}>
                  {model.durations.map((s) => (
                    <option key={s} value={s}>
                      {t("seconds", { n: s })}
                    </option>
                  ))}
                </Pill>
              )}
              {kind === "image" && (
                <button
                  type="button"
                  aria-pressed={brand}
                  disabled={!enabled || busy}
                  onClick={() => setBrand((b) => !b)}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:opacity-50",
                    brand ? "border-selected/60 bg-primary/10 text-foreground" : "bg-secondary/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Palette className="size-3.5" aria-hidden /> {t("brandShort")}
                </button>
              )}
              <span className="ml-auto hidden font-mono text-[11px] text-muted-foreground lg:inline">{t("shortcut")}</span>
              <a href="/app/billing" className="hidden font-mono text-[11px] text-muted-foreground tabular-nums hover:text-foreground sm:inline">
                {t("balanceShort", { balance })}
              </a>
            </div>

            {(error || (model && balance < credits)) && (
              <p role="alert" className="mt-2 px-1 text-[13px] text-destructive">
                {error ? (t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.generic")) : t("errors.insufficient_credits")}{" "}
                {(error === "insufficient_credits" || (!error && model && balance < credits)) && (
                  <a href="/app/billing" className="link">
                    {tb("buyMore")}
                  </a>
                )}
              </p>
            )}
            {model && (
              <p className="mt-1.5 hidden px-1 text-[11px] text-muted-foreground sm:block">
                <a href={model.modelPage} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  {t("licenseLink")}
                </a>{" "}
                · {model.tagline[locale]} · {t("termsNote")}
              </p>
            )}
            {model && (
              <p className="mt-1.5 px-1 text-[11px] text-muted-foreground sm:hidden">
                <a href={model.modelPage} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {t("licenseLink")}
                </a>{" "}
                · {t("balanceShort", { balance })}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
