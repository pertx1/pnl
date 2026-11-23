"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { FORMAT_KEYS, PAD_COLORS, SUBTITLE_POSITIONS, SUBTITLE_SIZES, SUBTITLE_STYLES, TEXT_COLORS, namedCss, type RenderOptions } from "@/lib/clipper/styles";
import { cn } from "@/lib/utils";
import { accentSwatch, SubtitlePreview } from "./subtitle-preview";

/** Grupo de opciones excluyentes (radio accesible con botones; objetivo táctil de 44 px en móvil). */
function Segmented<T extends string>({ label, value, options, onChange, render }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; render: (v: T) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <p id={id} className="label-mono">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={cn(
              "min-h-11 rounded-md border px-3 text-sm sm:min-h-9",
              value === o ? "border-selected bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {render(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Opciones de render: formato, encuadre y plantilla de subtítulos (con vista previa). */
export function RenderOptionsPanel({ value, onChange, brandColors }: { value: RenderOptions; onChange: (v: RenderOptions) => void; brandColors: string[] }) {
  const t = useTranslations("clipper.options");
  const set = <K extends keyof RenderOptions>(k: K, v: RenderOptions[K]) => onChange({ ...value, [k]: v });
  const accents = [...new Set([...brandColors.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 6), "yellow", "green", "cyan", "magenta"])];
  const subsId = useId();

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
      <div className="space-y-4">
        <Segmented label={t("format")} value={value.format} options={FORMAT_KEYS} onChange={(v) => set("format", v)} render={(v) => <span className="font-mono tabular-nums">{v}</span>} />
        <Segmented label={t("layout")} value={value.layout} options={["crop", "fit"] as const} onChange={(v) => set("layout", v)} render={(v) => t(`layouts.${v}`)} />
        <p className="-mt-2 text-xs text-muted-foreground">{t(`layoutHint.${value.layout}`)}</p>
        {value.layout === "fit" && (
          <Segmented
            label={t("padColor")}
            value={value.padColor}
            options={PAD_COLORS}
            onChange={(v) => set("padColor", v)}
            render={(v) => (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3.5 rounded-full border" style={{ background: namedCss(v) }} aria-hidden />
                {t(`colors.${v}`)}
              </span>
            )}
          />
        )}

        <div className="flex items-start gap-3 border-t pt-3">
          <Switch id={subsId} checked={value.subtitles} onCheckedChange={(v) => set("subtitles", Boolean(v))} className="mt-0.5" />
          <label htmlFor={subsId} className="text-sm">
            <span className="font-medium">{t("subtitles")}</span>
            <span className="block text-xs text-muted-foreground">{t("subtitlesHint")}</span>
          </label>
        </div>

        {value.subtitles && (
          <>
            <div className="space-y-1.5">
              <p className="label-mono" id={`${subsId}-style`}>
                {t("style")}
              </p>
              <div role="radiogroup" aria-labelledby={`${subsId}-style`} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {SUBTITLE_STYLES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={value.style === s}
                    onClick={() => set("style", s)}
                    className={cn("space-y-1.5 rounded-md border p-1.5 text-left", value.style === s ? "border-selected bg-primary/10" : "hover:bg-accent")}
                  >
                    <SubtitlePreview options={{ ...value, style: s, format: "9:16", layout: "crop" }} compact className="w-full max-w-[96px]" />
                    <span className="block text-xs font-medium">{t(`styles.${s}`)}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t(`styleHint.${value.style}`)}</p>
            </div>
            <Segmented label={t("position")} value={value.position} options={SUBTITLE_POSITIONS} onChange={(v) => set("position", v)} render={(v) => t(`positions.${v}`)} />
            <Segmented label={t("size")} value={value.size} options={SUBTITLE_SIZES} onChange={(v) => set("size", v)} render={(v) => t(`sizes.${v}`)} />
            <Segmented
              label={t("accent")}
              value={value.accent}
              options={accents}
              onChange={(v) => set("accent", v)}
              render={(v) => (
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3.5 rounded-full border" style={{ background: accentSwatch(v) }} aria-hidden />
                  <span className={v.startsWith("#") ? "font-mono text-xs" : ""}>{v.startsWith("#") ? v.toUpperCase() : t(`colors.${v}`)}</span>
                </span>
              )}
            />
            {brandColors.length > 0 && <p className="-mt-2 text-xs text-muted-foreground">{t("accentHint")}</p>}
            {value.style !== "box" && value.style !== "word" && (
              <Segmented
                label={t("textColor")}
                value={value.textColor}
                options={TEXT_COLORS}
                onChange={(v) => set("textColor", v)}
                render={(v) => (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-3.5 rounded-full border" style={{ background: namedCss(v) }} aria-hidden />
                    {t(`colors.${v}`)}
                  </span>
                )}
              />
            )}
          </>
        )}
      </div>
      <div className="space-y-1.5">
        <p className="label-mono">{t("preview")}</p>
        <SubtitlePreview options={value} className={value.format === "16:9" ? "w-full" : value.format === "1:1" ? "w-full max-w-[160px]" : "w-full max-w-[140px]"} />
        <p className="text-xs text-muted-foreground">{t("previewHint")}</p>
      </div>
    </div>
  );
}
