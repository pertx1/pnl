import { z } from "zod";
import { TIKTOK_PRIVACY, YT_CATEGORIES, YT_LANGUAGES, type PlatformOptions } from "@/lib/posts/rules";

/**
 * Opciones por red que el MCP acepta al crear o editar un borrador (mismos campos que el editor de Kreo).
 * Se guardan en post_targets.platform_options de cada cuenta de esa red.
 */
export const youtubeOptionsSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional().describe("Título del vídeo (obligatorio para enviar a aprobación)."),
    tags: z.array(z.string().trim().min(1).max(100)).max(40).optional().describe("Etiquetas (máx. 500 caracteres en total)."),
    privacy: z.enum(["public", "unlisted", "private"]).optional(),
    category_id: z.enum(YT_CATEGORIES).optional().describe("Id de categoría de YouTube (p. ej. 20 = Gaming, 22 = People & Blogs, 24 = Entertainment, 27 = Education)."),
    made_for_kids: z.boolean().optional(),
    thumbnail_asset_id: z.uuid().optional().describe("Imagen JPG/PNG (máx. 2 MB) de la biblioteca del proyecto."),
    playlist_id: z.string().regex(/^[A-Za-z0-9_-]{10,64}$/).optional(),
    notify_subscribers: z.boolean().optional(),
    embeddable: z.boolean().optional(),
    license: z.enum(["youtube", "creativeCommon"]).optional(),
    language: z.enum(YT_LANGUAGES).optional(),
  })
  .strict();

export const tiktokOptionsSchema = z
  .object({
    privacy_level: z.enum(TIKTOK_PRIVACY as [string, ...string[]]).optional().describe("Quién puede verlo. Mientras la app no esté auditada, TikTok solo permite SELF_ONLY."),
    allow_comments: z.boolean().optional(),
    allow_duet: z.boolean().optional(),
    allow_stitch: z.boolean().optional(),
    brand_organic: z.boolean().optional().describe("Promociona tu propia marca."),
    branded_content: z.boolean().optional().describe("Colaboración pagada con otra marca."),
  })
  .strict();

export const instagramOptionsSchema = z
  .object({
    trial_reel: z.enum(["manual", "auto"]).optional().describe("Publicar como reel de prueba (solo un vídeo)."),
  })
  .strict();

export type YouTubeIn = z.infer<typeof youtubeOptionsSchema>;
export type TikTokIn = z.infer<typeof tiktokOptionsSchema>;
export type InstagramIn = z.infer<typeof instagramOptionsSchema>;

const defined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/** Opciones del MCP → PlatformOptions de Kreo para una red. `title` es el título interno, que sirve de título de YouTube por defecto. */
export function toPlatformOptions(
  platform: string,
  o: { youtube?: YouTubeIn; tiktok?: TikTokIn; instagram?: InstagramIn },
  title?: string | null,
): PlatformOptions {
  if (platform === "youtube") {
    const y = o.youtube ?? {};
    return defined({
      yt_title: y.title ?? (title?.trim() ? title.trim().slice(0, 100) : undefined),
      yt_tags: y.tags,
      yt_privacy: y.privacy,
      yt_category_id: y.category_id,
      yt_made_for_kids: y.made_for_kids,
      yt_thumbnail_asset_id: y.thumbnail_asset_id,
      yt_playlist_id: y.playlist_id,
      yt_notify_subscribers: y.notify_subscribers,
      yt_embeddable: y.embeddable,
      yt_license: y.license,
      yt_language: y.language,
    }) as PlatformOptions;
  }
  if (platform === "tiktok") {
    const t = o.tiktok ?? {};
    return defined({
      privacy_level: t.privacy_level as PlatformOptions["privacy_level"],
      // En Kreo se guardan como "disable_*" (TikTok: ninguna interacción activada por defecto).
      disable_comment: t.allow_comments === undefined ? undefined : !t.allow_comments,
      disable_duet: t.allow_duet === undefined ? undefined : !t.allow_duet,
      disable_stitch: t.allow_stitch === undefined ? undefined : !t.allow_stitch,
      brand_organic_toggle: t.brand_organic,
      brand_content_toggle: t.branded_content,
    }) as PlatformOptions;
  }
  if (platform === "instagram") return defined({ ig_trial_reel: o.instagram?.trial_reel }) as PlatformOptions;
  return {};
}

/** Subidas desde el chat: tipos y tamaño admitidos (mismo límite que el bucket project-media del plan gratis). */
export const UPLOAD_MIME = { "video/mp4": "mp4", "video/quicktime": "mov", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
export type UploadMime = keyof typeof UPLOAD_MIME;
