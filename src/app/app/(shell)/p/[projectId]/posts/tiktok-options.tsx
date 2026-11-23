"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { PlatformOptions } from "@/lib/posts/rules";
import type { EditorAsset } from "@/lib/server/posts";
import {
  declarationKind,
  disclosureIncomplete,
  disclosureLabel,
  durationExceeded,
  privacyDisabled,
  resolveTikTokMode,
  TIKTOK_LINKS,
} from "@/lib/social/tiktok-core";
import { cn } from "@/lib/utils";
import type { CreatorInfoResult } from "./tiktok-actions";

export { tiktokApproveBlock } from "@/lib/social/tiktok-core";

const linkCls = "underline underline-offset-2 hover:text-foreground";

/**
 * Bloque de TikTok del editor según las Content Sharing Guidelines de TikTok
 * (https://developers.tiktok.com/doc/content-sharing-guidelines):
 * 1a nickname y avatar de `creator_info` · 1b parar si el creador no puede publicar · 1c duración máxima ·
 * 2b privacidad de `privacy_level_options` SIN valor por defecto · 2c interacciones apagadas por defecto y en gris si
 * el creador las tiene desactivadas · 3 divulgación comercial con los textos oficiales · 5a vista previa ·
 * 5c consentimiento expreso · 5d aviso de procesado. Kreo no añade marcas de agua ni texto promocional.
 */
export function TikTokOptions({
  handle,
  options,
  onChange,
  audited,
  creator,
  onLoad,
  video,
  durationSec,
  onDuration,
  aiGenerated,
}: {
  handle: string;
  options: PlatformOptions;
  onChange: (p: Partial<PlatformOptions>) => void;
  audited: boolean;
  creator: CreatorInfoResult | undefined;
  onLoad: () => void;
  video: EditorAsset | null;
  durationSec: number | undefined;
  onDuration: (sec: number) => void;
  aiGenerated: boolean;
}) {
  const t = useTranslations("tiktok.editor");
  const tp = useTranslations("posts.tiktok");
  const mode = resolveTikTokMode(options.tiktok_mode, audited);
  const direct = mode === "direct";
  const info = creator?.ok ? creator.info : null;

  // creator_info al abrir el bloque (y cada vez que se vuelve a montar). La respuesta la guarda el editor.
  useEffect(() => {
    onLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = info?.nickname ?? (info?.username ? `@${info.username}` : handle);
  const tooLong = info ? durationExceeded(durationSec, info.maxDurationSec) : false;
  const label = disclosureLabel(options);
  const selectCls = "w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm disabled:opacity-60";

  return (
    <div className="space-y-3 text-sm">
      {/* 1a · cuenta que recibirá el contenido */}
      <div className="flex items-center gap-2">
        {info?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.avatarUrl} alt="" className="size-7 rounded-full border object-cover" referrerPolicy="no-referrer" />
        ) : null}
        <p className="text-xs text-muted-foreground">{creator ? t("postingAs", { name }) : t("loadingCreator")}</p>
      </div>
      {creator && !creator.ok && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{t(`creatorErrors.${creator.error}`)}</span>
          <Button type="button" size="xs" variant="secondary" onClick={onLoad}>
            {t("retry")}
          </Button>
        </div>
      )}

      {/* 5a · vista previa del vídeo que se enviará (y medida de su duración para 1c) */}
      {video?.url ? (
        <video
          src={video.url}
          controls
          muted
          playsInline
          preload="metadata"
          aria-label={t("preview")}
          className="max-h-72 w-full rounded-md border bg-black object-contain"
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && onDuration(e.currentTarget.duration)}
        />
      ) : (
        <p className="text-xs text-destructive">{t("noVideo")}</p>
      )}
      {info?.maxDurationSec ? (
        <p className={cn("text-[11px]", tooLong ? "text-destructive" : "text-muted-foreground")}>
          {tooLong ? t("durationExceeded", { duration: Math.round(durationSec ?? 0), max: info.maxDurationSec }) : t("maxDuration", { max: info.maxDurationSec })}
        </p>
      ) : null}

      {/* Modo: borradores (por defecto sin auditoría) o publicación directa */}
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium">{t("mode")}</legend>
        {(["inbox", "direct"] as const).map((m) => (
          <label key={m} className="flex items-start gap-2">
            <input type="radio" name={`tiktok-mode-${handle}`} className="mt-1" checked={mode === m} onChange={() => onChange({ tiktok_mode: m, tiktok_consent: false })} />
            <span>
              {m === "inbox" ? t("modeInbox") : t("modeDirect")}
              <span className="block text-[11px] text-muted-foreground">{m === "inbox" ? t("modeInboxHint") : t("modeDirectHint")}</span>
            </span>
          </label>
        ))}
        {direct && !audited && <p className="text-[11px] text-warning">{t("modeDirectUnaudited")}</p>}
      </fieldset>

      {!direct && (
        <div className="space-y-1 rounded-md bg-secondary/60 p-2 text-[11px] text-muted-foreground">
          <p className="flex gap-1.5">
            <Info className="size-3.5 shrink-0" aria-hidden /> {t("inboxCaption")}
          </p>
          <p>{t("pendingLimit")}</p>
          {aiGenerated && <p className="text-warning">{t("inboxAi")}</p>}
        </div>
      )}

      {direct && (
        <>
          {/* 2b · privacidad: solo las opciones de creator_info y sin valor por defecto */}
          <div className="space-y-1">
            <Label className="text-xs">{tp("privacy")}</Label>
            <select
              className={selectCls}
              value={options.privacy_level ?? ""}
              disabled={!info}
              onChange={(e) => onChange({ privacy_level: (e.target.value || undefined) as PlatformOptions["privacy_level"] })}
            >
              <option value="">{tp("privacyPlaceholder")}</option>
              {(info?.privacyOptions ?? []).map((p) => {
                const why = privacyDisabled(p, Boolean(options.tiktok_disclose && options.brand_content_toggle));
                return (
                  <option key={p} value={p} disabled={Boolean(why)} title={why ? t("brandedPrivate") : undefined}>
                    {tp(p)}
                    {why ? ` — ${t("brandedPrivate")}` : ""}
                  </option>
                );
              })}
            </select>
            <p className="text-[11px] text-muted-foreground">{t("privacyFromTikTok")}</p>
          </div>

          {/* 2c · interacciones: apagadas por defecto; en gris si el creador las tiene desactivadas */}
          {(
            [
              ["disable_comment", "allowComments", info?.commentDisabled],
              ["disable_duet", "allowDuet", info?.duetDisabled],
              ["disable_stitch", "allowStitch", info?.stitchDisabled],
            ] as const
          ).map(([key, lbl, off]) => (
            <label key={key} className={cn("flex items-center justify-between gap-2", off && "opacity-60")} title={off ? t("interactionDisabled") : undefined}>
              <span>
                {tp(lbl)}
                {off && <span className="block text-[11px] text-muted-foreground">{t("interactionDisabled")}</span>}
              </span>
              <Switch checked={!off && options[key] === false} disabled={Boolean(off) || !info} onCheckedChange={(v) => onChange({ [key]: !v })} />
            </label>
          ))}

          {/* 3 · divulgación de contenido comercial (apagada por defecto) */}
          <div className="space-y-2 rounded-md bg-secondary/60 p-2">
            <label className="flex items-start justify-between gap-2">
              <span>
                {t("disclose")}
                <span className="block text-[11px] text-muted-foreground">{t("discloseHint")}</span>
              </span>
              <Switch
                checked={Boolean(options.tiktok_disclose)}
                onCheckedChange={(v) => onChange(v ? { tiktok_disclose: true } : { tiktok_disclose: false, brand_organic_toggle: false, brand_content_toggle: false })}
              />
            </label>
            {options.tiktok_disclose && (
              <div className="space-y-2 border-t pt-2">
                <label className="flex items-start gap-2">
                  <Checkbox checked={Boolean(options.brand_organic_toggle)} onCheckedChange={(v) => onChange({ brand_organic_toggle: Boolean(v) })} className="mt-0.5" />
                  <span>
                    {t("yourBrand")}
                    <span className="block text-[11px] text-muted-foreground">{t("yourBrandHint")}</span>
                  </span>
                </label>
                <label className="flex items-start gap-2" title={options.privacy_level === "SELF_ONLY" ? t("brandedPrivate") : undefined}>
                  <Checkbox
                    checked={Boolean(options.brand_content_toggle)}
                    disabled={options.privacy_level === "SELF_ONLY"}
                    onCheckedChange={(v) => onChange({ brand_content_toggle: Boolean(v) })}
                    className="mt-0.5"
                  />
                  <span>
                    {t("brandedContent")}
                    <span className="block text-[11px] text-muted-foreground">
                      {options.privacy_level === "SELF_ONLY" ? t("brandedPrivate") : t("brandedContentHint")}
                    </span>
                  </span>
                </label>
                {label && <p className="text-[11px] font-medium">{label === "paid" ? t("labelPaid") : t("labelPromotional")}</p>}
                {disclosureIncomplete(options) && <p className="text-[11px] text-destructive">{t("discloseIncomplete")}</p>}
              </div>
            )}
          </div>
        </>
      )}

      {/* 5c · consentimiento expreso para enviar ESTE contenido a TikTok */}
      <label className="flex items-start gap-2 rounded-md border p-2">
        <Checkbox checked={Boolean(options.tiktok_consent)} onCheckedChange={(v) => onChange({ tiktok_consent: Boolean(v) })} className="mt-0.5" />
        <span className="text-xs">{direct ? t("consent") : t("consentInbox")}</span>
      </label>
      <p className="text-[11px] text-muted-foreground">{t("noWatermark")}</p>
    </div>
  );
}

/**
 * Declaración obligatoria junto al botón de publicar/aprobar (Content Sharing Guidelines 4) con los enlaces
 * oficiales, el aviso de procesado (5d) y, si el botón está bloqueado, el motivo visible.
 */
export function TikTokDeclaration({ targets, blockText }: { targets: PlatformOptions[]; blockText?: string }) {
  const t = useTranslations("tiktok.editor");
  const branded = targets.some((o) => o.tiktok_disclose && declarationKind(o) === "branded");
  const links = {
    music: (c: ReactNode) => (
      <a href={TIKTOK_LINKS.musicUsage} target="_blank" rel="noopener noreferrer" className={linkCls}>
        {c}
      </a>
    ),
    bc: (c: ReactNode) => (
      <a href={TIKTOK_LINKS.brandedContentPolicy} target="_blank" rel="noopener noreferrer" className={linkCls}>
        {c}
      </a>
    ),
  };
  return (
    <div className="space-y-1 text-[11px] text-muted-foreground">
      <p>{branded ? t.rich("declarationBranded", links) : t.rich("declarationMusic", links)}</p>
      <p>{t("processing")}</p>
      {blockText && (
        <p role="alert" className="text-destructive">
          {blockText}
        </p>
      )}
    </div>
  );
}
