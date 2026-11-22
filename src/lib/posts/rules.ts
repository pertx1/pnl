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
  yt_tags?: string[];
  yt_category_id?: (typeof YT_CATEGORIES)[number];
  yt_thumbnail_asset_id?: string; // imagen de la biblioteca del proyecto (JPG/PNG, máx. 2 MB)
  yt_playlist_id?: string;
  yt_notify_subscribers?: boolean; // por defecto true
  yt_embeddable?: boolean; // por defecto true
  yt_license?: "youtube" | "creativeCommon";
  yt_language?: (typeof YT_LANGUAGES)[number];
};

/** Categorías de YouTube asignables (ids estables de la Data API). */
export const YT_CATEGORIES = ["22", "1", "2", "10", "15", "17", "19", "20", "23", "24", "25", "26", "27", "28", "29"] as const;
export const YT_LANGUAGES = ["es", "en", "ca", "eu", "gl", "pt", "fr", "it", "de"] as const;
/** YouTube limita las etiquetas a 500 caracteres en total. */
export const ytTagsLength = (tags: string[] = []) => tags.reduce((n, t) => n + t.length + (t.includes(" ") ? 2 : 0), 0) + Math.max(0, tags.length - 1);

export type MediaKind = "image" | "video";
export type RuleViolation =
  | "tiktok_privacy_required"
  | "tiktok_media_required"
  | "tiktok_branded_private"
  | "instagram_media_required"
  | "youtube_video_required"
  | "youtube_title_required"
  | "youtube_tags_too_long"
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
    if (ytTagsLength(options.yt_tags) > 500) v.push("youtube_tags_too_long");
  }
  return v;
}

/** Aviso anti-baneo: mismo texto idéntico en 3 o más cuentas. */
export function duplicateCaptionWarning(captions: string[]) {
  const counts = new Map<string, number>();
  for (const c of captions.map((x) => x.trim()).filter(Boolean)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.values()].some((n) => n >= 3);
}
