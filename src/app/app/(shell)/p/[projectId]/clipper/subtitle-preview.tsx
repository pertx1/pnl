"use client";

import { accentToNamed, CLIP_FORMATS, namedCss, resolveRenderOptions, STYLE_PRESETS, subtitleInput, type RenderOptions } from "@/lib/clipper/styles";
import { cn } from "@/lib/utils";

const SAMPLE = ["Esto", "lo", "cambia", "todo", "para", "siempre"];

/**
 * Vista previa en CSS de una plantilla de subtítulos: usa los MISMOS parámetros que se envían a auto-subtitle
 * (subtitleInput), así que lo que se ve aquí es lo que se pide a fal (la animación real es un rebote de entrada).
 */
export function SubtitlePreview({ options, className, compact = false }: { options: RenderOptions; className?: string; compact?: boolean }) {
  const r = resolveRenderOptions(options, null);
  const input = subtitleInput("preview", r, "es");
  const preset = STYLE_PRESETS[options.style];
  const words = SAMPLE.slice(0, Math.min(preset.words, 3));
  const activeIndex = Math.min(1, words.length - 1);
  const { width, height } = CLIP_FORMATS[options.format];
  // Escala del texto: font_size está en píxeles de un vídeo de 1080 de lado corto.
  const scale = compact ? 0.11 : 0.16;
  const fontPx = Math.max(7, Math.round(input.font_size * scale));
  const fit = options.layout === "fit";

  return (
    <div
      aria-hidden
      className={cn("relative mx-auto overflow-hidden rounded-md border bg-neutral-800", className)}
      style={{ aspectRatio: `${width} / ${height}`, background: fit ? namedCss(options.padColor) : undefined }}
    >
      {/* «Vídeo»: degradado neutro; en modo encajar, una franja 16:9 en el centro con bandas de color. */}
      <div
        className="absolute inset-x-0 bg-gradient-to-br from-neutral-500 via-neutral-700 to-neutral-900"
        style={fit && options.format !== "16:9" ? { top: "50%", transform: "translateY(-50%)", aspectRatio: "16 / 9" } : { top: 0, bottom: 0 }}
      >
        <div className="absolute top-1/2 left-1/2 size-[30%] -translate-x-1/2 -translate-y-[70%] rounded-full bg-neutral-400/50" />
      </div>
      {options.subtitles && (
        <div
          className={cn(
            "absolute inset-x-[6%] flex flex-wrap justify-center gap-x-[0.25em] text-center leading-tight",
            options.position === "top" && "top-[14%]",
            options.position === "center" && "top-1/2 -translate-y-1/2",
            options.position === "bottom" && (options.format === "9:16" ? "bottom-[16%]" : "bottom-[8%]"),
          )}
          style={{
            fontFamily: options.style === "caps" ? "'Bebas Neue', Impact, 'Arial Narrow', sans-serif" : "inherit",
            fontWeight: input.font_weight === "black" ? 900 : input.font_weight === "bold" ? 700 : 400,
            fontSize: fontPx,
            textTransform: options.style === "caps" ? "uppercase" : undefined,
          }}
        >
          <span
            className="rounded-[0.2em] px-[0.3em] py-[0.05em]"
            style={{ background: input.background_color !== "none" ? namedCss(input.background_color) : undefined, opacity: 1 }}
          >
            {words.map((w, i) => (
              <span
                key={i}
                style={{
                  color: namedCss(i === activeIndex ? input.highlight_color : input.font_color),
                  WebkitTextStroke: input.stroke_width ? `${Math.max(0.5, input.stroke_width * scale * 0.6)}px ${namedCss(input.stroke_color)}` : undefined,
                  paintOrder: "stroke fill",
                  marginRight: i < words.length - 1 ? "0.25em" : 0,
                }}
              >
                {w}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

/** Muestra de color (con nombre que admite auto-subtitle) para los botones de color de acento. */
export function accentSwatch(accent: string) {
  return namedCss(accentToNamed(accent));
}
