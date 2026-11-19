"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Mic, Music, Pause, Play, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CreditCost } from "@/components/kreo/credit-cost";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MUSIC_DURATIONS, musicCredits, voiceCredits, VOICE_MODELS } from "@/lib/ai/audio";
import { cn } from "@/lib/utils";
import { generateMusic, generateVoice } from "./audio-actions";

export type VoiceOption = { id: string; name: string; description: string | null; previewUrl: string | null; labels: Record<string, string> };

export function AudioForm({ projectId, balance, enabled, voices }: { projectId: string; balance: number; enabled: boolean; voices: VoiceOption[] }) {
  const t = useTranslations("studioAudio");
  const locale = useLocale() as "es" | "en";
  const router = useRouter();
  const [mode, setMode] = useState<"voice" | "music">("voice");
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState(voices[0]?.id ?? "");
  const [modelId, setModelId] = useState(VOICE_MODELS[0].id);
  const [prompt, setPrompt] = useState("");
  const [seconds, setSeconds] = useState<number>(30);
  const [instrumental, setInstrumental] = useState(true);
  const [error, setError] = useState<string>();
  const [busy, start] = useTransition();
  const [playing, setPlaying] = useState<string | null>(null);
  const preview = useRef<HTMLAudioElement | null>(null);

  const model = VOICE_MODELS.find((m) => m.id === modelId) ?? VOICE_MODELS[0];
  const credits = mode === "voice" ? voiceCredits(model, text.trim().length) : musicCredits(seconds);
  const ready = enabled && balance >= credits && (mode === "voice" ? text.trim().length >= 2 && Boolean(voiceId) && text.length <= model.maxChars : prompt.trim().length >= 3);
  const voice = voices.find((v) => v.id === voiceId);

  function togglePreview(v: VoiceOption) {
    if (!v.previewUrl) return;
    if (playing === v.id) {
      preview.current?.pause();
      setPlaying(null);
      return;
    }
    preview.current?.pause();
    const a = new Audio(v.previewUrl);
    preview.current = a;
    a.onended = () => setPlaying(null);
    void a.play().then(() => setPlaying(v.id)).catch(() => setPlaying(null));
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-md border p-0.5" role="tablist" aria-label={t("modeLabel")}>
        {(
          [
            ["voice", Mic, t("voiceTab")],
            ["music", Music, t("musicTab")],
          ] as const
        ).map(([k, Icon, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={mode === k}
            onClick={() => {
              setMode(k);
              setError(undefined);
            }}
            className={cn("flex flex-1 items-center justify-center gap-2 rounded-sm px-3 py-1.5 text-sm", mode === k ? "bg-secondary font-semibold" : "text-muted-foreground hover:text-foreground")}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      <fieldset disabled={!enabled || busy} className="space-y-5">
        {mode === "voice" ? (
          <>
            <div className="space-y-2">
              <Label>{t("model")}</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {VOICE_MODELS.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => setModelId(m.id)}
                    aria-pressed={modelId === m.id}
                    className={cn("rounded-md border p-3 text-left transition-colors", modelId === m.id ? "border-selected bg-primary/5" : "hover:border-selected/40")}
                  >
                    <span className="font-semibold">{m.label}</span>
                    <p className="mt-1 text-xs text-muted-foreground">{m.tagline[locale]}</p>
                    <p className="mt-2 font-mono text-[11px] text-muted-foreground">{t("per1k", { usd: m.usdPer1kChars.toFixed(2) })}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="voice">{t("voice")}</Label>
              {voices.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noVoices")}</p>
              ) : (
                <div className="flex gap-2">
                  <select id="voice" className="min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 py-2 text-sm" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {[v.labels.gender, v.labels.accent, v.labels.age].filter(Boolean).length ? ` · ${[v.labels.gender, v.labels.accent, v.labels.age].filter(Boolean).join(", ")}` : ""}
                      </option>
                    ))}
                  </select>
                  {voice?.previewUrl && (
                    <Button type="button" variant="secondary" size="icon" aria-label={playing === voice.id ? t("stopPreview") : t("preview")} onClick={() => togglePreview(voice)}>
                      {playing === voice.id ? <Pause /> : <Play />}
                    </Button>
                  )}
                </div>
              )}
              {voice?.description && <p className="text-xs text-muted-foreground">{voice.description}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tts-text">{t("text")}</Label>
              <Textarea id="tts-text" rows={5} maxLength={model.maxChars} value={text} placeholder={t("textPlaceholder")} onChange={(e) => setText(e.target.value)} />
              <p className="text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                {text.length}/{model.maxChars}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="music-prompt">{t("musicPrompt")}</Label>
              <Textarea id="music-prompt" rows={3} maxLength={1000} value={prompt} placeholder={t("musicPlaceholder")} onChange={(e) => setPrompt(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("musicHint")}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="music-duration">{t("duration")}</Label>
                <select id="music-duration" className="w-full rounded-md border border-input bg-transparent px-2 py-2 text-sm" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
                  {MUSIC_DURATIONS.map((s) => (
                    <option key={s} value={s}>
                      {t("seconds", { n: s })}
                    </option>
                  ))}
                </select>
                <p className="font-mono text-[11px] text-muted-foreground">{t("perMinute", { usd: "0.15" })}</p>
              </div>
              <label className="flex items-center gap-2 self-center text-sm">
                <Checkbox checked={instrumental} onCheckedChange={(v) => setInstrumental(Boolean(v))} /> {t("instrumental")}
              </label>
            </div>
          </>
        )}
      </fieldset>

      <div className="space-y-1 rounded-md border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{t("termsTitle")}</p>
        <p>{mode === "voice" ? t("termsVoice") : t("termsMusic")}</p>
        <p>
          <a href="https://elevenlabs.io/terms-of-use" target="_blank" rel="noreferrer" className="underline">
            {t("termsLink")}
          </a>
          {mode === "music" && (
            <>
              {" · "}
              <a href="https://elevenlabs.io/eleven-music-model-specific-terms" target="_blank" rel="noreferrer" className="underline">
                {t("musicTermsLink")}
              </a>
            </>
          )}
        </p>
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
      {busy && (
        <p role="status" className="text-sm text-muted-foreground">
          {mode === "music" ? t("generatingMusic") : t("generatingVoice")}
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
              const key = crypto.randomUUID();
              const res =
                mode === "voice"
                  ? await generateVoice({ projectId, voiceId, modelId, text, idempotencyKey: key })
                  : await generateMusic({ projectId, prompt, seconds, instrumental, idempotencyKey: key });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              toast.success(t("done"));
              if (mode === "voice") setText("");
              else setPrompt("");
              router.refresh();
            })
          }
        >
          <Sparkles /> {busy ? t("generating") : `${t("generate")} · ${credits}`}
        </Button>
      </div>
    </div>
  );
}
