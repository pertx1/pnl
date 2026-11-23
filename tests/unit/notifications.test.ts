import { describe, expect, it } from "vitest";
import { composeText, failureReason, fill, kindLabel, postLabel, warningsText } from "@/lib/notifications/text";
import { isNotificationType, NOTIFICATION_TYPES, safeAppLink } from "@/lib/notifications/types";
import { buildWeeklySummary, weeklyHasContent, weeklyPeriod, type WeeklyInput } from "@/lib/notifications/weekly-core";
import { consentDedupeKey, googleOAuthInTesting, lastConsentAt, youtubeConsentStatus } from "@/lib/notifications/youtube-consent";

describe("caducidad del permiso de YouTube («En prueba»)", () => {
  const consent = new Date("2026-11-20T10:00:00Z");

  it("caduca a los 7 días y avisa desde 2 días antes", () => {
    const ok = youtubeConsentStatus(consent, new Date("2026-11-24T10:00:00Z"));
    expect(ok.state).toBe("ok");
    expect(ok.expiresAt.toISOString()).toBe("2026-11-27T10:00:00.000Z");
    expect(ok.warnFrom.toISOString()).toBe("2026-11-25T10:00:00.000Z");
    expect(youtubeConsentStatus(consent, new Date("2026-11-25T10:00:00Z")).state).toBe("expiring");
    expect(youtubeConsentStatus(consent, new Date("2026-11-27T09:59:00Z")).state).toBe("expiring");
    expect(youtubeConsentStatus(consent, new Date("2026-11-27T10:00:00Z")).state).toBe("expired");
  });

  it("si el token trae caducidad explícita, manda esa", () => {
    const st = youtubeConsentStatus(consent, new Date("2026-11-21T10:00:00Z"), new Date("2026-11-22T10:00:00Z"));
    expect(st.state).toBe("expiring");
    expect(st.expiresAt.toISOString()).toBe("2026-11-22T10:00:00.000Z");
  });

  it("el último consentimiento es la conexión o reconexión más reciente", () => {
    const at = lastConsentAt("2026-11-01T08:00:00Z", [
      { action: "social_account.connected", created_at: "2026-11-01T08:00:01Z" },
      { action: "social_account.reconnected", created_at: "2026-11-18T12:00:00Z" },
      { action: "post.submitted", created_at: "2026-11-22T12:00:00Z" },
    ]);
    expect(at.toISOString()).toBe("2026-11-18T12:00:00.000Z");
    expect(lastConsentAt("2026-11-01T08:00:00Z", []).toISOString()).toBe("2026-11-01T08:00:00.000Z");
  });

  it("deduplica por cuenta y consentimiento; y se desactiva con Google en producción", () => {
    expect(consentDedupeKey("acc", consent)).toBe("yt_consent:acc:2026-11-20T10:00");
    expect(googleOAuthInTesting({})).toBe(true);
    expect(googleOAuthInTesting({ GOOGLE_OAUTH_IN_PRODUCTION: "true" })).toBe(false);
  });
});

describe("textos de los avisos", () => {
  it("rellena plantillas en el idioma del usuario", () => {
    expect(fill("Hola {a} {b}", { a: "x" })).toBe("Hola x {b}");
    expect(composeText("post_published", { platform: "Instagram", post: "Mi post", account: "@kreo" }, "es")).toEqual({ title: "Publicado en Instagram", body: "Mi post · @kreo" });
    expect(composeText("post_published", { platform: "Instagram", post: "My post", account: "@kreo" }, "en").title).toBe("Published on Instagram");
  });

  it("explica el motivo del fallo en lenguaje claro, nunca con el código crudo", () => {
    expect(failureReason("token_expired", "es")).toMatch(/caducado/);
    expect(failureReason("quotaExceeded", "es")).toMatch(/cuota/);
    expect(failureReason("spam_risk_too_many_posts", "en")).toMatch(/limiting/);
    expect(failureReason("youtube:unavailable", "es")).toMatch(/no respondió/);
    expect(failureReason("constructor", "es")).toMatch(/rechazó/);
    expect(failureReason(null, "es")).toMatch(/rechazó/);
    expect(failureReason("weird_code_123", "es")).not.toContain("weird_code_123");
  });

  it("resume los pasos opcionales fallidos y otras etiquetas", () => {
    expect(warningsText(["thumbnail_403", "captions_failed", "captions_403"], "es")).toBe("miniatura, subtítulos");
    expect(warningsText(["unknown_1"], "es")).toBe("");
    expect(kindLabel("video", "es")).toBe("vídeo");
    expect(kindLabel("toString", "es")).toBe("contenido");
    expect(postLabel("", "es")).toBe("Publicación sin título");
    expect(postLabel("x".repeat(100), "en")).toHaveLength(80);
  });

  it("tipos y enlaces internos", () => {
    expect(NOTIFICATION_TYPES).toContain("weekly_summary");
    expect(isNotificationType("post_failed")).toBe(true);
    expect(isNotificationType("nope")).toBe(false);
    expect(safeAppLink("/app/p/123/posts/456")).toBe("/app/p/123/posts/456");
    expect(safeAppLink("/app/p/1/clipper?job=2")).toBe("/app/p/1/clipper?job=2");
    expect(safeAppLink("https://evil.example")).toBeNull();
    expect(safeAppLink("//evil.example/app")).toBeNull();
    expect(safeAppLink("/app/../../x\"")).toBeNull();
  });
});

describe("resumen semanal", () => {
  // Lunes 30 nov 2026: periodo = lunes 23 a domingo 29; próxima semana = 30 nov a 6 dic.
  const base: WeeklyInput = {
    project: { id: "p1", name: "Marca" },
    today: "2026-11-30",
    timezone: "Europe/Madrid",
    accounts: [
      { id: "ig", platform: "instagram", handle: "marca", display_name: null, status: "active" },
      { id: "tt", platform: "tiktok", handle: null, display_name: "Marca TT", status: "active" },
      { id: "yt", platform: "youtube", handle: "@canal", display_name: null, status: "active" },
    ],
    metrics: [
      { social_account_id: "ig", day: "2026-11-21", followers: 900 },
      { social_account_id: "ig", day: "2026-11-22", followers: 1000 },
      { social_account_id: "ig", day: "2026-11-29", followers: 1100 },
      { social_account_id: "ig", day: "2026-11-30", followers: 5000 }, // fuera del periodo
      { social_account_id: "tt", day: "2026-11-29", followers: 50 },
      { social_account_id: "yt", day: "2026-11-22", followers: 300 },
      { social_account_id: "yt", day: "2026-11-29", followers: 320 },
    ],
    targets: [
      { social_account_id: "ig", status: "published", published_at: "2026-11-23T10:00:00Z", updated_at: "2026-11-23T10:00:00Z" },
      { social_account_id: "tt", status: "published", published_at: "2026-11-29T22:30:00Z", updated_at: "2026-11-29T22:30:00Z" }, // 23:30 Madrid del domingo
      { social_account_id: "tt", status: "published", published_at: "2026-11-29T23:30:00Z", updated_at: "2026-11-29T23:30:00Z" }, // ya es lunes en Madrid
      { social_account_id: "yt", status: "failed", published_at: null, updated_at: "2026-11-25T09:00:00Z" },
      { social_account_id: "ig", status: "published", published_at: "2026-11-20T10:00:00Z", updated_at: "2026-11-23T10:00:00Z" }, // publicada antes
    ],
    upcoming: [
      { id: "u2", title: "Segundo", scheduled_at: "2026-12-02T17:00:00Z", status: "scheduled", platforms: ["instagram"] },
      { id: "u1", title: null, scheduled_at: "2026-12-01T17:00:00Z", status: "pending_approval", platforms: ["tiktok"] },
      { id: "u3", title: "Lejos", scheduled_at: "2026-12-10T17:00:00Z", status: "scheduled", platforms: ["instagram"] },
      { id: "u4", title: "Borrador", scheduled_at: "2026-12-01T17:00:00Z", status: "draft", platforms: ["instagram"] },
    ],
    overdueTasks: [
      { id: "t2", title: "Grabar", due_date: "2026-11-28" },
      { id: "t1", title: "Guion", due_date: "2026-11-20" },
      { id: "t3", title: "Hoy no vence", due_date: "2026-11-30" },
    ],
  };

  it("calcula el periodo y la semana siguiente", () => {
    expect(weeklyPeriod("2026-11-30")).toEqual({ period: { from: "2026-11-23", to: "2026-11-29" }, next: { from: "2026-11-30", to: "2026-12-06" } });
  });

  it("seguidores con variación por cuenta y YouTube aparte, sin variación ni sumas", () => {
    const s = buildWeeklySummary(base);
    expect(s.accounts).toEqual([
      { id: "ig", platform: "instagram", label: "@marca", followers: 1100, change: 100, status: "active" },
      { id: "tt", platform: "tiktok", label: "Marca TT", followers: 50, change: null, status: "active" },
    ]);
    expect(s.youtube).toEqual([{ id: "yt", label: "@canal", subscribers: 320, status: "active" }]);
    expect(JSON.stringify(s.accounts)).not.toContain("yt");
  });

  it("cuenta publicadas y fallidas de la semana en hora local", () => {
    const s = buildWeeklySummary(base);
    expect(s.posts.published).toBe(2);
    expect(s.posts.failed).toBe(1);
    expect(s.posts.byPlatform).toEqual({ instagram: { published: 1, failed: 0 }, tiktok: { published: 1, failed: 0 }, youtube: { published: 0, failed: 1 } });
  });

  it("lista lo programado para la semana siguiente (ordenado) y las tareas vencidas", () => {
    const s = buildWeeklySummary(base);
    expect(s.upcoming.count).toBe(2);
    expect(s.upcoming.pendingApproval).toBe(1);
    expect(s.upcoming.items.map((u) => u.id)).toEqual(["u1", "u2"]);
    expect(s.overdueTasks).toEqual({ count: 2, items: [{ id: "t1", title: "Guion", due: "2026-11-20" }, { id: "t2", title: "Grabar", due: "2026-11-28" }] });
    expect(weeklyHasContent(s)).toBe(true);
  });

  it("un proyecto vacío no genera aviso", () => {
    const s = buildWeeklySummary({ ...base, accounts: [], metrics: [], targets: [], upcoming: [], overdueTasks: [] });
    expect(weeklyHasContent(s)).toBe(false);
  });
});
