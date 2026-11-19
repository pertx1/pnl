/**
 * Reglas de publicación por plataforma (compartidas cliente/servidor).
 * Se validan al enviar a aprobación y al aprobar. Nada se publica sin aprobación humana.
 */
export type TikTokPrivacy = "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";
export const TIKTOK_PRIVACY: TikTokPrivacy[] = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"];

export type PlatformOptions = {
  // TikTok (Content Sharing Guidelines): privacidad SIN valor por defecto, interacción y contenido comercial.
  privacy_level?: TikTokPrivacy;
  disable_comment?: boolean;
  disable_duet?: boolean;
  disable_stitch?: boolean;
  brand_organic_toggle?: boolean; // "Tu marca"
  brand_content_toggle?: boolean; // "Contenido de marca" (colaboración pagada)
  // YouTube
  yt_title?: string;
  yt_privacy?: "public" | "unlisted" | "private";
  yt_made_for_kids?: boolean;
};

export type MediaKind = "image" | "video";
export type RuleViolation =
  | "tiktok_privacy_required"
  | "tiktok_media_required"
  | "tiktok_branded_private"
  | "instagram_media_required"
  | "youtube_video_required"
  | "youtube_title_required"
  | "caption_too_long";

const CAPTION_MAX: Record<string, number> = { tiktok: 2200, instagram: 2200, youtube: 5000 };

export function validateTarget(
  platform: string,
  caption: string,
  media: MediaKind[],
  options: PlatformOptions,
): RuleViolation[] {
  const v: RuleViolation[] = [];
  if (caption.length > (CAPTION_MAX[platform] ?? 2200)) v.push("caption_too_long");
  if (platform === "tiktok") {
    if (!options.privacy_level) v.push("tiktok_privacy_required");
    if (!media.length) v.push("tiktok_media_required");
    // TikTok: el contenido de marca (pagado) no puede publicarse como privado.
    if (options.brand_content_toggle && options.privacy_level === "SELF_ONLY") v.push("tiktok_branded_private");
  }
  if (platform === "instagram" && !media.length) v.push("instagram_media_required");
  if (platform === "youtube") {
    if (media.filter((m) => m === "video").length !== 1) v.push("youtube_video_required");
    if (!options.yt_title?.trim()) v.push("youtube_title_required");
  }
  return v;
}

/** Aviso anti-baneo: mismo texto idéntico en 3 o más cuentas. */
export function duplicateCaptionWarning(captions: string[]) {
  const counts = new Map<string, number>();
  for (const c of captions.map((x) => x.trim()).filter(Boolean)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.values()].some((n) => n >= 3);
}
