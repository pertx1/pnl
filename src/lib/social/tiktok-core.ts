/**
 * TikTok · lógica pura (sin servidor) compartida por el worker, las acciones de servidor y el editor.
 * Tests: tests/unit/tiktok.test.ts.
 *
 * Dos formas OFICIALES de llevar un vídeo a TikTok con la Content Posting API:
 * - "direct": Direct Post (`/v2/post/publish/video/init/`, scope `video.publish`). Sin la auditoría de TikTok solo
 *   funciona si la CUENTA es privada (`unaudited_client_can_only_post_to_private_accounts`).
 * - "inbox": subida a la bandeja/borradores del creador (`/v2/post/publish/inbox/video/init/`, scope `video.upload`).
 *   TikTok le manda una notificación y es el creador quien termina y publica en la app de TikTok (elige privacidad,
 *   texto, etiquetas). Máx. 5 envíos pendientes cada 24 h (`spam_risk_too_many_pending_share`).
 * Si ninguna API puede usarse, Kreo NO automatiza nada: deja el destino «listo para subir a mano» (modo "manual").
 */
import type { PlatformOptions, TikTokPrivacy } from "@/lib/posts/rules";

export type TikTokMode = "direct" | "inbox";
export type TikTokHandoff = { mode: "inbox" | "manual"; reason: string | null };

/** Scope oficial para la subida a borradores (inbox). Debe estar activado en la consola de TikTok. */
export const TIKTOK_INBOX_SCOPE = "video.upload";
/** Estado de un destino que Kreo ya entregó y que el creador tiene que terminar en TikTok. */
export const AWAITING_USER_PUBLISH = "awaiting_user_publish";

/** `TIKTOK_DIRECT_POST_AUDITED=true` solo cuando TikTok haya aprobado la auditoría de Direct Post. */
export function tiktokDirectPostAudited(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/** Modo efectivo: el elegido en el editor o, si no hay, borradores mientras no haya auditoría. */
export function resolveTikTokMode(mode: PlatformOptions["tiktok_mode"], audited: boolean): TikTokMode {
  if (mode === "direct" || mode === "inbox") return mode;
  return audited ? "direct" : "inbox";
}

/** Código de error de la plataforma sin el prefijo de paso ("init_failed:xxx" → "xxx"). */
export function platformCode(code: string | null | undefined): string {
  const c = (code ?? "").replace(/^(tiktok|instagram|youtube):/, "");
  const i = c.indexOf(":");
  return i >= 0 ? c.slice(i + 1) : c;
}

const TRANSIENT = new Set(["rate_limited", "unavailable", "rate_limit_exceeded"]);

/** Direct Post rechazado por estar sin auditar (o sin cupo de usuarios): se puede pasar a borradores sin riesgo. */
export function directFallsBackToInbox(code: string): boolean {
  const c = platformCode(code);
  return (
    c === "unaudited_client_can_only_post_to_private_accounts" ||
    c === "reached_active_user_cap" ||
    c === "privacy_level_option_mismatch" ||
    code === "privacy_not_allowed"
  );
}

/**
 * La subida a borradores falló: salvo errores transitorios (que se reintentan), el destino pasa a «subir a mano».
 * Así un destino de TikTok nunca queda «fallido» por no tener auditoría, el scope o el cupo de pendientes.
 */
export function inboxFallsBackToManual(code: string): boolean {
  return !TRANSIENT.has(code) && !TRANSIENT.has(platformCode(code));
}

/** Motivo corto (para mostrar) de por qué se pasó a «subir a mano». */
export function manualReason(code: string): string {
  const c = platformCode(code);
  if (c === "scope_not_authorized") return "scope_missing";
  if (c === "spam_risk_too_many_pending_share") return "too_many_pending";
  if (c.startsWith("spam_risk")) return "spam_risk";
  if (c === "access_token_invalid" || code.includes("token")) return "reconnect";
  if (code === "unsupported_media" || code === "video_required") return "video_required";
  if (code === "video_too_large") return "video_too_large";
  return "inbox_unavailable";
}

/** Se guarda en `post_targets.error_code` con el prefijo "info:" (no es un error: el destino no ha fallado). */
export function handoffCode(h: TikTokHandoff): string {
  return (h.mode === "inbox" ? "info:tiktok_inbox" : `info:tiktok_manual${h.reason ? `:${h.reason}` : ""}`).slice(0, 120);
}

export function parseHandoff(errorCode: string | null | undefined): TikTokHandoff | null {
  if (!errorCode?.startsWith("info:tiktok_")) return null;
  const rest = errorCode.slice("info:tiktok_".length);
  if (rest === "inbox") return { mode: "inbox", reason: null };
  if (rest === "manual") return { mode: "manual", reason: null };
  if (rest.startsWith("manual:")) return { mode: "manual", reason: rest.slice(7) || null };
  return null;
}

/** Resultado de `status/fetch` para un envío a borradores. */
export function inboxOutcome(status: string | null | undefined): "published" | "failed" | "waiting" {
  if (status === "PUBLISH_COMPLETE") return "published";
  if (status === "FAILED") return "failed";
  return "waiting";
}

/** Primer `publicaly_available_post_id` del JSON crudo de `status/fetch` (int64: sin pasar por Number). */
export function tiktokPostIdFromRaw(raw: string): string | null {
  const m = /"publicaly_available_post_id"\s*:\s*\[\s*"?(\d{1,25})/.exec(raw);
  return m ? m[1] : null;
}

// ----------------------------------------------------------------------------- creator_info (Content Sharing Guidelines)

export type CreatorInfo = {
  nickname: string | null;
  username: string | null;
  avatarUrl: string | null;
  privacyOptions: TikTokPrivacy[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxDurationSec: number | null;
};

const PRIVACY = new Set<string>(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]);

/** Normaliza la respuesta de `creator_info/query` (sin confiar en tipos). */
export function parseCreatorInfo(data: unknown): CreatorInfo {
  const d = (data ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.slice(0, 500) : null);
  const max = Number(d.max_video_post_duration_sec);
  return {
    nickname: str(d.creator_nickname),
    username: str(d.creator_username),
    avatarUrl: typeof d.creator_avatar_url === "string" && d.creator_avatar_url.startsWith("https://") ? d.creator_avatar_url.slice(0, 1000) : null,
    privacyOptions: (Array.isArray(d.privacy_level_options) ? d.privacy_level_options : []).filter((p): p is TikTokPrivacy => typeof p === "string" && PRIVACY.has(p)),
    commentDisabled: d.comment_disabled === true,
    duetDisabled: d.duet_disabled === true,
    stitchDisabled: d.stitch_disabled === true,
    maxDurationSec: Number.isFinite(max) && max > 0 ? Math.floor(max) : null,
  };
}

/**
 * Códigos que TikTok devuelve con HTTP 200 en `creator_info` cuando el creador NO puede publicar ahora
 * (hay que parar y pedir que lo intente más tarde).
 */
export function creatorBlocker(code: string | null | undefined): "daily_cap" | "banned" | "client_cap" | null {
  if (code === "spam_risk_too_many_posts") return "daily_cap";
  if (code === "spam_risk_user_banned_from_posting") return "banned";
  if (code === "reached_active_user_cap") return "client_cap";
  return null;
}

/** El contenido de marca (Branded content) solo puede ser público o para amigos. */
export const BRANDED_PRIVACY: TikTokPrivacy[] = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS"];

/** ¿Está deshabilitada esta privacidad en el desplegable? (y por qué). */
export function privacyDisabled(p: TikTokPrivacy, brandedContent: boolean): "branded_private" | null {
  return brandedContent && !BRANDED_PRIVACY.includes(p) ? "branded_private" : null;
}

/** Etiqueta que pondrá TikTok según la divulgación comercial (textos oficiales). */
export function disclosureLabel(o: Pick<PlatformOptions, "brand_organic_toggle" | "brand_content_toggle">): "paid" | "promotional" | null {
  if (o.brand_content_toggle) return "paid"; // solo «Branded content» o las dos → «Paid partnership»
  if (o.brand_organic_toggle) return "promotional";
  return null;
}

/** Declaración junto al botón: con Branded content → Branded Content Policy + Music Usage Confirmation. */
export function declarationKind(o: Pick<PlatformOptions, "brand_content_toggle">): "music" | "branded" {
  return o.brand_content_toggle ? "branded" : "music";
}

/** Divulgación activada sin elegir ninguna opción → no se puede publicar. */
export function disclosureIncomplete(o: Pick<PlatformOptions, "tiktok_disclose" | "brand_organic_toggle" | "brand_content_toggle">): boolean {
  return Boolean(o.tiktok_disclose) && !o.brand_organic_toggle && !o.brand_content_toggle;
}

/** Duración del vídeo por encima del máximo que permite TikTok a este creador. */
export function durationExceeded(durationSec: number | null | undefined, maxSec: number | null | undefined): boolean {
  return typeof durationSec === "number" && typeof maxSec === "number" && maxSec > 0 && durationSec > maxSec + 0.5;
}

type CreatorState = { ok: true; info: CreatorInfo } | { ok?: false; error: string } | undefined;
export type TikTokBlock = { key: string; params?: Record<string, number> };

/**
 * Motivo (clave de messages/modules/tiktok → tiktok.editor) por el que el botón de aprobar/enviar debe estar
 * deshabilitado para TikTok, o null. Es la versión de interfaz de las Content Sharing Guidelines; el servidor
 * vuelve a validar lo que puede (`validateTarget`).
 */
export function tiktokApproveBlock(targets: { options: PlatformOptions; creator: CreatorState; durationSec?: number; audited: boolean }[]): TikTokBlock | null {
  for (const x of targets) {
    const o = x.options;
    const direct = resolveTikTokMode(o.tiktok_mode, x.audited) === "direct";
    if (x.creator && !x.creator.ok) {
      // 1b: si el creador no puede publicar ahora, se para y se avisa.
      const e = x.creator.error;
      if (e === "daily_cap" || e === "banned" || (direct && e === "client_cap")) return { key: `creatorErrors.${e}` };
      if (direct) return { key: `creatorErrors.${e}` };
    }
    if (x.creator?.ok && durationExceeded(x.durationSec, x.creator.info.maxDurationSec)) {
      return { key: "durationExceeded", params: { duration: Math.round(x.durationSec!), max: x.creator.info.maxDurationSec! } };
    }
    if (direct && disclosureIncomplete(o)) return { key: "discloseIncomplete" };
    if (direct && o.brand_content_toggle && o.privacy_level && !BRANDED_PRIVACY.includes(o.privacy_level)) return { key: "brandedPrivate" };
  }
  return null;
}

export const TIKTOK_LINKS = {
  musicUsage: "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en",
  brandedContentPolicy: "https://www.tiktok.com/legal/page/global/bc-policy/en",
} as const;
