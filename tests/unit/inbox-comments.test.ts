import { describe, expect, it } from "vitest";
import {
  COMMENT_MAX_LENGTH,
  commentExpiresAt,
  flattenComments,
  nestComments,
  parseCommentChange,
  parseMediaList,
  repliedTopLevel,
  replyTarget,
  validCommentReply,
} from "@/lib/inbox/comments";
import { parseIgWebhookPayload } from "@/lib/inbox/ig-webhook";
import {
  commentsEnabled,
  isUnifiedLogin,
  LEGACY_REQUIRED_SCOPES,
  missingScopes,
  parseAssignedAccounts,
  parseDebugToken,
  UNIFIED_REQUIRED_SCOPES,
  webhookFields,
} from "@/lib/inbox/meta-scopes";
import { includesComments, isReadScope, providerCanMarkRead, threadChannelsFor } from "@/lib/inbox/read-state";

const DAY = 86_400_000;
const OWN = "17841400000000001";
/** Permisos de la configuración 1203482298883759 (Unified Login por defecto). */
const CONFIG_SCOPES = ["instagram_basic", "instagram_content_publish", "instagram_manage_messages", "instagram_manage_comments", "ads_management", "ads_read"];

describe("permisos de la Bandeja con Facebook Login for Business", () => {
  it("Unified Login: la configuración actual basta (sin pages_*)", () => {
    expect(missingScopes(UNIFIED_REQUIRED_SCOPES, CONFIG_SCOPES)).toEqual([]);
    expect(UNIFIED_REQUIRED_SCOPES).not.toContain("pages_show_list");
    expect(UNIFIED_REQUIRED_SCOPES).not.toContain("pages_manage_metadata");
  });
  it("Facebook Login clásico: con esa configuración faltan los permisos de página", () => {
    expect(missingScopes(LEGACY_REQUIRED_SCOPES, CONFIG_SCOPES)).toEqual(["pages_manage_metadata", "pages_show_list"]);
  });
  it("detecta qué falta si la persona desmarca un permiso", () => {
    expect(missingScopes(UNIFIED_REQUIRED_SCOPES, ["instagram_basic"])).toEqual(["instagram_manage_messages"]);
    expect(missingScopes(UNIFIED_REQUIRED_SCOPES, [])).toEqual(["instagram_basic", "instagram_manage_messages"]);
  });
  it("campos del webhook según los permisos", () => {
    expect(webhookFields(CONFIG_SCOPES)).toEqual(["messages", "comments"]);
    expect(webhookFields(["instagram_basic", "instagram_manage_messages"])).toEqual(["messages"]);
  });
  it("marca de conexión y comentarios activados", () => {
    expect(isUnifiedLogin({ login: "unified" })).toBe(true);
    expect(isUnifiedLogin({ login: "instagram" })).toBe(false);
    expect(isUnifiedLogin({ page_id: "1" })).toBe(false);
    expect(isUnifiedLogin(null)).toBe(false);
    expect(commentsEnabled({ login: "unified", comments: "1" })).toBe(true);
    expect(commentsEnabled({ login: "unified", comments: "0" })).toBe(false);
    expect(commentsEnabled({ page_id: "1", comments: "1" })).toBe(false);
  });
  it("lee debug_token (expires_at = 0 → no caduca)", () => {
    expect(parseDebugToken({ data: { is_valid: true, scopes: ["instagram_basic", 3], expires_at: 0 } })).toEqual({ valid: true, scopes: ["instagram_basic"], expiresAt: null });
    const t = parseDebugToken({ data: { is_valid: true, scopes: [], expires_at: 1_800_000_000 } });
    expect(t?.expiresAt?.toISOString()).toBe(new Date(1_800_000_000_000).toISOString());
    expect(parseDebugToken({ error: { code: 190 } })).toBeNull();
  });
  it("lee /me/assigned_instagram_accounts y descarta ids no numéricos", () => {
    expect(parseAssignedAccounts({ data: [{ id: OWN, username: "akerra" }, { id: "x" }, { id: 123 }] })).toEqual([
      { id: OWN, username: "akerra" },
      { id: "123", username: null },
    ]);
    expect(parseAssignedAccounts({ error: {} })).toBeNull();
  });
});

describe("publicaciones y comentarios de Instagram", () => {
  const now = new Date("2026-11-26T12:00:00Z");

  it("solo publicaciones con comentarios; miniatura correcta en vídeos", () => {
    const list = parseMediaList({
      data: [
        { id: "1", media_type: "VIDEO", thumbnail_url: "https://cdn/t.jpg", media_url: "https://cdn/v.mp4", comments_count: 3, timestamp: "2026-11-20T10:00:00+0000", caption: "Hola   mundo\n#kreo" },
        { id: "2", media_type: "IMAGE", media_url: "https://cdn/i.jpg", comments_count: 0 },
        { id: "3", media_type: "IMAGE", media_url: "http://inseguro/i.jpg", comments_count: 1 },
        { id: "abc", comments_count: 5 },
      ],
    });
    expect(list.map((m) => m.externalId)).toEqual(["1", "3"]);
    expect(list[0]).toMatchObject({ thumbnailUrl: "https://cdn/t.jpg", commentsCount: 3, captionSnippet: "Hola mundo #kreo" });
    expect(list[0].postedAt?.toISOString()).toBe("2026-11-20T10:00:00.000Z");
    expect(list[1].thumbnailUrl).toBeNull(); // solo https
  });

  it("aplana comentarios y respuestas, detecta los propios y descarta los de más de 30 días", () => {
    const body = {
      data: [
        {
          id: "101",
          text: "¿Precio?",
          timestamp: "2026-11-25T09:00:00+0000",
          from: { id: "555", username: "fan" },
          hidden: false,
          replies: { data: [{ id: "201", text: "Por DM", timestamp: "2026-11-25T10:00:00+0000", from: { id: OWN, username: "akerra" } }] },
        },
        { id: "102", text: "viejo", timestamp: new Date(now.getTime() - 40 * DAY).toISOString(), from: { id: "6" } },
        { id: "103", text: "oculto", timestamp: "2026-11-24T09:00:00+0000", username: "troll", hidden: true },
        { id: "104", text: "mío", timestamp: "2026-11-24T08:00:00+0000", user: { id: OWN } },
      ],
    };
    const out = flattenComments(body, OWN, now);
    expect(out.map((c) => c.externalId)).toEqual(["101", "201", "103", "104"]);
    expect(out.find((c) => c.externalId === "201")).toMatchObject({ parentExternalId: "101", isOwn: true });
    expect(out.find((c) => c.externalId === "101")).toMatchObject({ username: "fan", isOwn: false, body: "¿Precio?" });
    expect(out.find((c) => c.externalId === "103")).toMatchObject({ hidden: true, username: "troll" });
    expect(out.find((c) => c.externalId === "104")?.isOwn).toBe(true);
    expect(repliedTopLevel(out).has("101")).toBe(true);
    expect(repliedTopLevel(out).has("103")).toBe(false);
  });

  it("recorta el texto al máximo de Instagram", () => {
    const out = flattenComments({ data: [{ id: "1", text: "x".repeat(5000), timestamp: "2026-11-25T09:00:00+0000" }] }, OWN, now);
    expect(out[0].body).toHaveLength(COMMENT_MAX_LENGTH);
  });

  it("responder: al comentario de primer nivel; nunca a ocultos ni propios", () => {
    expect(replyTarget({ externalId: "1", parentExternalId: null, isOwn: false, hidden: false })).toEqual({ ok: true, targetId: "1" });
    expect(replyTarget({ externalId: "2", parentExternalId: "1", isOwn: false, hidden: false })).toEqual({ ok: true, targetId: "1" });
    expect(replyTarget({ externalId: "1", parentExternalId: null, isOwn: false, hidden: true })).toEqual({ ok: false, reason: "hidden" });
    expect(replyTarget({ externalId: "1", parentExternalId: null, isOwn: true, hidden: false })).toEqual({ ok: false, reason: "own" });
    expect(validCommentReply("  ")).toBe(false);
    expect(validCommentReply("gracias")).toBe(true);
    expect(validCommentReply("x".repeat(COMMENT_MAX_LENGTH + 1))).toBe(false);
  });

  it("caducidad: fecha del comentario (nunca futura) + 30 días", () => {
    expect(commentExpiresAt(new Date("2026-11-01T00:00:00Z"), now).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(commentExpiresAt(new Date("2027-01-01T00:00:00Z"), now).getTime()).toBe(now.getTime() + 30 * DAY);
  });

  it("agrupa en hilos con el más activo primero", () => {
    const rows = [
      { id: "a", external_comment_id: "1", parent_external_id: null, commented_at: "2026-11-20T10:00:00Z" },
      { id: "b", external_comment_id: "2", parent_external_id: null, commented_at: "2026-11-21T10:00:00Z" },
      { id: "c", external_comment_id: "3", parent_external_id: "1", commented_at: "2026-11-22T10:00:00Z" },
      { id: "d", external_comment_id: "4", parent_external_id: "999", commented_at: "2026-11-19T10:00:00Z" },
    ];
    const g = nestComments(rows);
    expect(g.map((x) => x.top.id)).toEqual(["a", "b", "d"]);
    expect(g[0].replies.map((r) => r.id)).toEqual(["c"]);
  });
});

describe("webhook de comentarios", () => {
  const payload = (value: unknown) =>
    JSON.stringify({ object: "instagram", entry: [{ id: OWN, time: 1, changes: [{ field: "comments", value }, { field: "mentions", value: {} }] }] });

  it("formato Facebook Login for Business / Unified Login (comment_id)", () => {
    const [b] = parseIgWebhookPayload(payload({ from: { id: "555", username: "fan" }, comment_id: "901", parent_id: "900", text: "¡Me encanta!", media: { id: "777", media_product_type: "FEED" } }));
    expect(b.accountId).toBe(OWN);
    expect(b.events).toEqual([]);
    expect(b.comments).toEqual([{ externalId: "901", parentExternalId: "900", fromId: "555", username: "fan", text: "¡Me encanta!", mediaId: "777" }]);
  });
  it("formato Instagram Login (id) y descarta valores incompletos", () => {
    expect(parseCommentChange({ id: "5", media: { id: "6" } })).toMatchObject({ externalId: "5", mediaId: "6", text: "", parentExternalId: null });
    expect(parseCommentChange({ id: "5" })).toBeNull();
    expect(parseCommentChange({ comment_id: "x", media: { id: "6" } })).toBeNull();
    expect(parseCommentChange(null)).toBeNull();
  });
});

describe("marcar como leído", () => {
  it("opciones válidas y canales que cubre cada una", () => {
    expect(isReadScope("all")).toBe(true);
    expect(isReadScope("tiktok")).toBe(false);
    expect(threadChannelsFor("all")).toEqual(["instagram", "gmail", "outlook"]);
    expect(threadChannelsFor("comments")).toEqual([]);
    expect(threadChannelsFor("gmail")).toEqual(["gmail"]);
    expect(includesComments("all")).toBe(true);
    expect(includesComments("instagram")).toBe(false);
  });
  it("en la plataforma solo con el permiso de modificar ya concedido (hoy no se pide)", () => {
    expect(providerCanMarkRead("gmail", ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"])).toBe(false);
    expect(providerCanMarkRead("gmail", ["https://www.googleapis.com/auth/gmail.modify"])).toBe(true);
    expect(providerCanMarkRead("outlook", ["https://graph.microsoft.com/Mail.Read", "https://graph.microsoft.com/Mail.Send"])).toBe(false);
    expect(providerCanMarkRead("outlook", ["https://graph.microsoft.com/Mail.ReadWrite"])).toBe(true);
    expect(providerCanMarkRead("instagram", CONFIG_SCOPES)).toBe(false);
  });
});
