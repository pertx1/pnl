import { describe, expect, it } from "vitest";
import { tiktokHandoffText } from "@/lib/notifications/text";
import { NOTIFICATION_TYPES } from "@/lib/notifications/types";
import { settledPostStatus } from "@/lib/posts/settle";
import {
  creatorBlocker,
  declarationKind,
  directFallsBackToInbox,
  disclosureIncomplete,
  disclosureLabel,
  durationExceeded,
  handoffCode,
  inboxFallsBackToManual,
  inboxOutcome,
  manualReason,
  parseCreatorInfo,
  parseHandoff,
  platformCode,
  privacyDisabled,
  resolveTikTokMode,
  tiktokApproveBlock,
  tiktokDirectPostAudited,
  tiktokPostIdFromRaw,
} from "@/lib/social/tiktok-core";

describe("TikTok · modo de entrega", () => {
  it("sin auditoría (variable distinta de 'true') va a borradores por defecto", () => {
    expect(tiktokDirectPostAudited(undefined)).toBe(false);
    expect(tiktokDirectPostAudited("1")).toBe(false);
    expect(tiktokDirectPostAudited(" TRUE ")).toBe(true);
    expect(resolveTikTokMode(undefined, false)).toBe("inbox");
    expect(resolveTikTokMode(undefined, true)).toBe("direct");
    // Lo elegido en el editor manda.
    expect(resolveTikTokMode("direct", false)).toBe("direct");
    expect(resolveTikTokMode("inbox", true)).toBe("inbox");
  });

  it("Direct Post rechazado por cliente sin auditar → borradores; otros errores no", () => {
    expect(platformCode("tiktok:init_failed:unaudited_client_can_only_post_to_private_accounts")).toBe("unaudited_client_can_only_post_to_private_accounts");
    expect(directFallsBackToInbox("init_failed:unaudited_client_can_only_post_to_private_accounts")).toBe(true);
    expect(directFallsBackToInbox("creator_blocked:reached_active_user_cap")).toBe(true);
    expect(directFallsBackToInbox("privacy_not_allowed")).toBe(true);
    expect(directFallsBackToInbox("upload_failed")).toBe(false);
    expect(directFallsBackToInbox("creator_blocked:spam_risk_user_banned_from_posting")).toBe(false);
  });

  it("borradores que fallan → «subir a mano», salvo errores transitorios (se reintentan)", () => {
    expect(inboxFallsBackToManual("inbox_init_failed:scope_not_authorized")).toBe(true);
    expect(inboxFallsBackToManual("inbox_init_failed:spam_risk_too_many_pending_share")).toBe(true);
    expect(inboxFallsBackToManual("rate_limited")).toBe(false);
    expect(inboxFallsBackToManual("unavailable")).toBe(false);
    expect(inboxFallsBackToManual("inbox_init_failed:rate_limit_exceeded")).toBe(false);
    expect(manualReason("inbox_init_failed:scope_not_authorized")).toBe("scope_missing");
    expect(manualReason("inbox_init_failed:spam_risk_too_many_pending_share")).toBe("too_many_pending");
    expect(manualReason("inbox_init_failed:access_token_invalid")).toBe("reconnect");
    expect(manualReason("whatever")).toBe("inbox_unavailable");
  });

  it("el modo se guarda como 'info:' (no es un error) y se lee de vuelta", () => {
    expect(handoffCode({ mode: "inbox", reason: null })).toBe("info:tiktok_inbox");
    expect(handoffCode({ mode: "manual", reason: "scope_missing" })).toBe("info:tiktok_manual:scope_missing");
    expect(parseHandoff("info:tiktok_inbox")).toEqual({ mode: "inbox", reason: null });
    expect(parseHandoff("info:tiktok_manual:too_many_pending")).toEqual({ mode: "manual", reason: "too_many_pending" });
    expect(parseHandoff("info:tiktok_manual")).toEqual({ mode: "manual", reason: null });
    expect(parseHandoff("warn:thumbnail_403")).toBeNull();
    expect(parseHandoff(null)).toBeNull();
  });

  it("estado de status/fetch para borradores", () => {
    expect(inboxOutcome("SEND_TO_USER_INBOX")).toBe("waiting");
    expect(inboxOutcome("PROCESSING_UPLOAD")).toBe("waiting");
    expect(inboxOutcome("PUBLISH_COMPLETE")).toBe("published");
    expect(inboxOutcome("FAILED")).toBe("failed");
  });

  it("lee el id del vídeo (int64) sin perder precisión", () => {
    const raw = '{"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":[7319876543210987654]},"error":{"code":"ok"}}';
    expect(tiktokPostIdFromRaw(raw)).toBe("7319876543210987654");
    expect(tiktokPostIdFromRaw('{"data":{"status":"SEND_TO_USER_INBOX"}}')).toBeNull();
  });
});

describe("TikTok · cierre de publicaciones con varias redes", () => {
  it("un destino de TikTok pendiente del creador no deja el post como fallido", () => {
    expect(settledPostStatus(["awaiting_user_publish"])).toBe("awaiting_user_publish");
    expect(settledPostStatus(["published", "awaiting_user_publish"])).toBe("awaiting_user_publish");
    expect(settledPostStatus(["scheduled_on_platform", "awaiting_user_publish"])).toBe("awaiting_user_publish");
    expect(settledPostStatus(["published", "scheduled_on_platform"])).toBe("scheduled_on_platform");
    expect(settledPostStatus(["awaiting_user_publish", "publishing"])).toBeNull();
    expect(settledPostStatus(["awaiting_user_publish", "failed"])).toBe("failed");
    expect(settledPostStatus(["published", "published"])).toBe("published");
  });
});

describe("TikTok · Content Sharing Guidelines", () => {
  it("normaliza creator_info y descarta valores desconocidos", () => {
    const info = parseCreatorInfo({
      creator_nickname: "Akerra",
      creator_username: "akerra",
      creator_avatar_url: "https://p16.tiktokcdn.com/a.jpg",
      privacy_level_options: ["SELF_ONLY", "FOLLOWER_OF_CREATOR", "EVIL"],
      comment_disabled: true,
      duet_disabled: false,
      stitch_disabled: true,
      max_video_post_duration_sec: 600,
    });
    expect(info).toEqual({
      nickname: "Akerra",
      username: "akerra",
      avatarUrl: "https://p16.tiktokcdn.com/a.jpg",
      privacyOptions: ["SELF_ONLY", "FOLLOWER_OF_CREATOR"],
      commentDisabled: true,
      duetDisabled: false,
      stitchDisabled: true,
      maxDurationSec: 600,
    });
    expect(parseCreatorInfo({ creator_avatar_url: "javascript:alert(1)" }).avatarUrl).toBeNull();
    expect(parseCreatorInfo(null).privacyOptions).toEqual([]);
  });

  it("bloqueos de creator_info (HTTP 200 con error)", () => {
    expect(creatorBlocker("spam_risk_too_many_posts")).toBe("daily_cap");
    expect(creatorBlocker("spam_risk_user_banned_from_posting")).toBe("banned");
    expect(creatorBlocker("reached_active_user_cap")).toBe("client_cap");
    expect(creatorBlocker("ok")).toBeNull();
  });

  it("etiquetas y declaración de la divulgación comercial", () => {
    expect(disclosureLabel({ brand_organic_toggle: true })).toBe("promotional");
    expect(disclosureLabel({ brand_content_toggle: true })).toBe("paid");
    expect(disclosureLabel({ brand_organic_toggle: true, brand_content_toggle: true })).toBe("paid");
    expect(disclosureLabel({})).toBeNull();
    expect(declarationKind({})).toBe("music");
    expect(declarationKind({ brand_content_toggle: true })).toBe("branded");
    expect(disclosureIncomplete({ tiktok_disclose: true })).toBe(true);
    expect(disclosureIncomplete({ tiktok_disclose: true, brand_content_toggle: true })).toBe(false);
    expect(disclosureIncomplete({})).toBe(false);
  });

  it("contenido de marca: «Solo yo» y «Seguidores» deshabilitados", () => {
    expect(privacyDisabled("SELF_ONLY", true)).toBe("branded_private");
    expect(privacyDisabled("FOLLOWER_OF_CREATOR", true)).toBe("branded_private");
    expect(privacyDisabled("PUBLIC_TO_EVERYONE", true)).toBeNull();
    expect(privacyDisabled("SELF_ONLY", false)).toBeNull();
  });

  it("duración máxima", () => {
    expect(durationExceeded(61, 60)).toBe(true);
    expect(durationExceeded(60.3, 60)).toBe(false);
    expect(durationExceeded(undefined, 60)).toBe(false);
    expect(durationExceeded(30, null)).toBe(false);
  });

  it("botón de aprobar bloqueado con el motivo", () => {
    const ok = { ok: true as const, info: parseCreatorInfo({ privacy_level_options: ["PUBLIC_TO_EVERYONE"], max_video_post_duration_sec: 60 }) };
    expect(tiktokApproveBlock([{ options: { tiktok_mode: "direct", tiktok_disclose: true }, creator: ok, audited: true }])).toEqual({ key: "discloseIncomplete" });
    expect(tiktokApproveBlock([{ options: { tiktok_mode: "direct" }, creator: ok, durationSec: 90, audited: true }])).toEqual({ key: "durationExceeded", params: { duration: 90, max: 60 } });
    expect(tiktokApproveBlock([{ options: { tiktok_mode: "direct" }, creator: { error: "daily_cap" }, audited: true }])).toEqual({ key: "creatorErrors.daily_cap" });
    // En borradores, un fallo puntual de creator_info no bloquea (la privacidad se elige en TikTok)…
    expect(tiktokApproveBlock([{ options: { tiktok_mode: "inbox" }, creator: { error: "generic" }, audited: false }])).toBeNull();
    // …pero un creador vetado o sin cupo diario sí.
    expect(tiktokApproveBlock([{ options: { tiktok_mode: "inbox" }, creator: { error: "banned" }, audited: false }])).toEqual({ key: "creatorErrors.banned" });
    expect(tiktokApproveBlock([{ options: { tiktok_mode: "direct" }, creator: ok, audited: true }])).toBeNull();
  });
});

describe("TikTok · aviso en la campana", () => {
  it("existe el tipo de aviso y el texto recuerda la etiqueta de IA", () => {
    expect(NOTIFICATION_TYPES).toContain("post_action_needed");
    const params = { platform: "TikTok", account: "@akerra", post: "Receta" };
    const inbox = tiktokHandoffText({ mode: "inbox", reason: null }, params, true, "es");
    expect(inbox.title).toBe("Termina tu publicación en TikTok");
    expect(inbox.body).toContain("borradores de TikTok");
    expect(inbox.body).toContain("Contenido generado por IA");
    const manual = tiktokHandoffText({ mode: "manual", reason: "scope_missing" }, params, false, "en");
    expect(manual.title).toBe("Ready to upload to TikTok manually");
    expect(manual.body).toContain("reconnect TikTok");
    expect(manual.body).not.toContain("AI-generated");
  });
});
