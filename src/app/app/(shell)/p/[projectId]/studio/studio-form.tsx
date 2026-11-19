"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Film, ImageIcon, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CreditCost } from "@/components/kreo/credit-cost";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { checkGeneration, startGeneration } from "./actions";

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
const ASPECTS = ["9:16", "1:1", "4:5", "16:9"] as const;
type Aspect = (typeof ASPECTS)[number];

export function StudioForm({
  projectId,
  balance,
  enabled,
  pendingIds,
  images,
  models,
}: {
  projectId: string;
  balance: number;
  enabled: boolean;
  pendingIds: string[];
  images: { id: string; url: string | null }[];
  models: Model[];
}) {
  const t = useTranslations("studio");
  const locale = useLocale() as "es" | "en";
  const router = useRouter();
  const [kind, setKind] = useState<"image" | "video">("image");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [modelId, setModelId] = useState(models.find((m) => m.kind === "image")?.id ?? "");
  const [duration, setDuration] = useState<number>(5);
  const [sourceId, setSourceId] = useState<string>();
  const [brand, setBrand] = useState(true);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<string[]>(pendingIds);
  const [busy, start] = useTransition();

  const visible = models.filter((m) => m.kind === kind);
  const model = models.find((m) => m.id === modelId);
  const credits = model ? (model.kind === "video" ? model.creditsByDuration[String(duration)] : model.creditsByDuration["0"]) ?? 0 : 0;
  const ready = enabled && prompt.trim().length >= 3 && Boolean(model) && balance >= credits && (!model?.needsImage || Boolean(sourceId));

  // Consulta los vídeos en cola cada 6 s hasta que terminan.
  useEffect(() => {
    if (!pending.length) return;
    const id = setInterval(async () => {
      for (const g of pending) {
        const res = await checkGeneration(g);
        if (res.status === "pending") continue;
        setPending((p) => p.filter((x) => x !== g));
        if (res.status === "done") toast.success(t("videoDone"));
        else toast.error(t("videoFailed"));
        router.refresh();
      }
    }, 6000);
    return () => clearInterval(id);
  }, [pending, router, t]);

  function switchKind(k: "image" | "video") {
    setKind(k);
    const first = models.find((m) => m.kind === k);
    setModelId(first?.id ?? "");
    setDuration(first?.durations[0] ?? 5);
    setError(undefined);
  }

  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="flex gap-1 rounded-md border p-0.5" role="tablist">
          {(
            [
              ["image", ImageIcon, t("tabImage")],
              ["video", Film, t("tabVideo")],
            ] as const
          ).map(([k, Icon, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => switchKind(k)}
              className={cn("flex flex-1 items-center justify-center gap-2 rounded-sm px-3 py-1.5 text-sm", kind === k ? "bg-secondary font-semibold" : "text-muted-foreground hover:text-foreground")}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        <fieldset disabled={!enabled || busy} className="space-y-5">
          <div className="space-y-2">
            <Label>{t("model")}</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {visible.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => {
                    setModelId(m.id);
                    if (m.durations.length) setDuration(m.durations[0]);
                  }}
                  aria-pressed={modelId === m.id}
                  className={cn("rounded-md border p-3 text-left transition-colors", modelId === m.id ? "border-primary bg-primary/5" : "hover:border-primary/40")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{m.label}</span>
                    <span className="label-mono !text-[9px]">{t(`tiers.${m.tier}`)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{m.tagline[locale]}</p>
                  <p className="mt-2 font-mono text-[11px] text-primary-ink">
                    {m.kind === "image" ? t("perImage", { usd: m.usdPerUnit.toFixed(3) }) : t("perSecond", { usd: m.usdPerUnit.toFixed(3) })}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt">{t("prompt")}</Label>
            <Textarea
              id="prompt"
              rows={3}
              maxLength={1500}
              value={prompt}
              placeholder={kind === "image" ? t("promptPlaceholderImage") : t("promptPlaceholderVideo")}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {!model?.needsImage && (
              <div className="space-y-2">
                <Label htmlFor="aspect">{t("aspect")}</Label>
                <select id="aspect" className="w-full rounded-md border border-input bg-transparent px-2 py-2 text-sm" value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)}>
                  {ASPECTS.map((a) => (
                    <option key={a} value={a}>
                      {t(`aspects.${a}`)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {model?.kind === "video" && (
              <div className="space-y-2">
                <Label htmlFor="duration">{t("duration")}</Label>
                <select id="duration" className="w-full rounded-md border border-input bg-transparent px-2 py-2 text-sm" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  {model.durations.map((s) => (
                    <option key={s} value={s}>
                      {t("seconds", { n: s })}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {model?.needsImage && (
            <div className="space-y-2">
              <Label>{t("sourceImage")}</Label>
              <p className="text-xs text-muted-foreground">{t("sourceImageHint")}</p>
              {images.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noImages")}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {images.slice(0, 16).map((img) => (
                    <button
                      type="button"
                      key={img.id}
                      onClick={() => setSourceId(img.id)}
                      aria-pressed={sourceId === img.id}
                      className={cn("size-16 overflow-hidden rounded-md border-2", sourceId === img.id ? "border-primary" : "border-transparent opacity-70 hover:opacity-100")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {img.url && <img src={img.url} alt="" className="size-full object-cover" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {kind === "image" && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={brand} onCheckedChange={(v) => setBrand(Boolean(v))} /> {t("brandColors")}
            </label>
          )}
        </fieldset>

        {model && (
          <p className="text-xs text-muted-foreground">
            <a href={model.modelPage} target="_blank" rel="noreferrer" className="underline">
              {t("licenseLink")}
            </a>{" "}
            · {t("termsNote")}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.generic")}
          </p>
        )}
        {pending.length > 0 && (
          <p role="status" className="flex items-center gap-2 rounded-md border bg-secondary/50 px-3 py-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> {t("pending")}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex items-center gap-3">
            <span className="label-mono">{t("cost")}</span>
            <CreditCost credits={credits} />
            <span className="font-mono text-xs text-muted-foreground">{t("balance", { balance })}</span>
          </div>
          <Button
            variant="brand"
            disabled={!ready || busy}
            onClick={() =>
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
                if (res.status === "pending") setPending((p) => [...p, res.generationId]);
                else toast.success(t("generated"));
                setPrompt("");
                router.refresh();
              })
            }
          >
            <Sparkles /> {busy ? t("generating") : `${t("generate")} · ${credits}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
