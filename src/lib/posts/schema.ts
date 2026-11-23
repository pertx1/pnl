import { z } from "zod";
import { TIKTOK_PRIVACY, YT_CATEGORIES, YT_LANGUAGES } from "./rules";

/** Validación de las opciones por red de un destino (compartida por el editor de publicaciones y las plantillas). */
export const platformOptionsSchema = z
  .object({
    privacy_level: z.enum(TIKTOK_PRIVACY as [string, ...string[]]).optional(),
    disable_comment: z.boolean().optional(),
    disable_duet: z.boolean().optional(),
    disable_stitch: z.boolean().optional(),
    brand_organic_toggle: z.boolean().optional(),
    brand_content_toggle: z.boolean().optional(),
    ig_trial_reel: z.enum(["manual", "auto"]).optional(),
    yt_title: z.string().trim().max(100).optional(),
    yt_privacy: z.enum(["public", "unlisted", "private"]).optional(),
    yt_made_for_kids: z.boolean().optional(),
    yt_tags: z.array(z.string().trim().min(1).max(100)).max(40).optional(),
    yt_category_id: z.enum(YT_CATEGORIES).optional(),
    yt_thumbnail_asset_id: z.uuid().optional(),
    yt_playlist_id: z.string().regex(/^[A-Za-z0-9_-]{10,64}$/).optional(),
    yt_notify_subscribers: z.boolean().optional(),
    yt_embeddable: z.boolean().optional(),
    yt_license: z.enum(["youtube", "creativeCommon"]).optional(),
    yt_language: z.enum(YT_LANGUAGES).optional(),
  })
  .strict();
