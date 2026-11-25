import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseIgWebhookPayload } from "@/lib/inbox/ig-webhook";
import { verifyMetaSignatureAny } from "@/lib/inbox/meta-signature";
import { parseIgEvent } from "@/lib/inbox/sync";
import { platformErrorDetail } from "@/lib/social/http";
import {
  buildIgAuthorizeUrl,
  cleanIgCode,
  IG_LOGIN_SCOPES,
  igRefreshDue,
  instagramLoginEnabled,
  isInstagramLogin,
  parseIgShortToken,
} from "@/lib/social/instagram-login";

const DAY = 86_400_000;

describe("Instagram Login · autorización", () => {
  it("construye la URL oficial con los permisos de publicar y mensajes (sin comentarios)", () => {
    const url = new URL(
      buildIgAuthorizeUrl({ clientId: "123", redirectUri: "https://kreo-nine.vercel.app/api/oauth/instagram/callback", state: "abc", scopes: IG_LOGIN_SCOPES }),
    );
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://kreo-nine.vercel.app/api/oauth/instagram/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("abc");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_content_publish,instagram_business_manage_messages");
    expect(url.searchParams.get("scope")).not.toContain("manage_comments");
  });

  it("la URL de la Bandeja usa su propia redirección", () => {
    const url = new URL(buildIgAuthorizeUrl({ clientId: "1", redirectUri: "https://kreo-nine.vercel.app/api/inbox/oauth/instagram/callback", state: "s", scopes: IG_LOGIN_SCOPES }));
    expect(url.searchParams.get("redirect_uri")).toBe("https://kreo-nine.vercel.app/api/inbox/oauth/instagram/callback");
  });

  it("quita el #_ que Instagram añade al code", () => {
    expect(cleanIgCode("AQBx123#_")).toBe("AQBx123");
    expect(cleanIgCode("AQBx123")).toBe("AQBx123");
  });

  it("solo se activa con INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET", () => {
    expect(instagramLoginEnabled({ INSTAGRAM_APP_ID: "1", INSTAGRAM_APP_SECRET: "x" })).toBe(true);
    expect(instagramLoginEnabled({ INSTAGRAM_APP_ID: "1" })).toBe(false);
    expect(instagramLoginEnabled({ META_APP_ID: "1", META_APP_SECRET: "x" })).toBe(false);
  });

  it("distingue cuentas de Instagram Login de las de Facebook Login", () => {
    expect(isInstagramLogin({ login: "instagram" })).toBe(true);
    expect(isInstagramLogin({ page_id: "999" })).toBe(false);
    expect(isInstagramLogin(null)).toBe(false);
  });
});

describe("Instagram Login · token", () => {
  it("lee la respuesta documentada { data: [{ access_token, user_id, permissions }] }", () => {
    expect(parseIgShortToken({ data: [{ access_token: "tok", user_id: "1020", permissions: "instagram_business_basic,instagram_business_manage_messages" }] })).toEqual({
      accessToken: "tok",
      userId: "1020",
      permissions: ["instagram_business_basic", "instagram_business_manage_messages"],
    });
  });
  it("acepta la forma plana y permisos en array", () => {
    expect(parseIgShortToken({ access_token: "t", user_id: 5, permissions: ["instagram_business_basic"] })).toEqual({ accessToken: "t", userId: "5", permissions: ["instagram_business_basic"] });
  });
  it("sin token → null", () => {
    expect(parseIgShortToken({ error_type: "OAuthException", code: 400, error_message: "x" })).toBeNull();
    expect(parseIgShortToken(null)).toBeNull();
  });
  it("registra el código de error de api.instagram.com sin el mensaje", () => {
    expect(platformErrorDetail({ error_type: "OAuthException", code: 400, error_message: "Invalid code abc" })).toBe("OAuthException_400");
  });

  it("refresca solo si quedan < 10 días, no ha caducado y tiene ≥ 24 h", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const at = (days: number) => new Date(now.getTime() + days * DAY);
    expect(igRefreshDue(at(5), now)).toBe(true);
    expect(igRefreshDue(at(30), now)).toBe(false);
    expect(igRefreshDue(at(-1), now)).toBe(false); // caducado: hay que reconectar
    expect(igRefreshDue(undefined, now)).toBe(false);
    // Emitido hace < 24 h (caduca en 59,5 días) con un margen hipotético → nunca antes de 24 h.
    expect(igRefreshDue(new Date(now.getTime() + 60 * DAY - 12 * 3600_000), now)).toBe(false);
  });
});

describe("webhook de Instagram (Instagram Login y Facebook Login)", () => {
  const body = JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: "17841400000000001",
        time: 1764000000000,
        messaging: [
          { sender: { id: "9001" }, recipient: { id: "17841400000000001" }, timestamp: 1764000000000, message: { mid: "m1", text: "hola" } },
          { sender: { id: "17841400000000001" }, recipient: { id: "9001" }, timestamp: 1764000001000, message: { mid: "m2", text: "¡hola!", is_echo: true } },
        ],
      },
    ],
  });
  const sign = (secret: string) => `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

  it("acepta la firma con el secreto de la app de Meta o con el de Instagram", () => {
    expect(verifyMetaSignatureAny(body, sign("meta-secret"), ["meta-secret", "ig-secret"])).toBe(true);
    expect(verifyMetaSignatureAny(body, sign("ig-secret"), ["meta-secret", "ig-secret"])).toBe(true);
    expect(verifyMetaSignatureAny(body, sign("ig-secret"), [undefined, "ig-secret"])).toBe(true);
  });
  it("rechaza firmas con otro secreto, sin cabecera o sin secretos configurados", () => {
    expect(verifyMetaSignatureAny(body, sign("otro"), ["meta-secret", "ig-secret"])).toBe(false);
    expect(verifyMetaSignatureAny(body, null, ["meta-secret"])).toBe(false);
    expect(verifyMetaSignatureAny(body, sign(""), ["", undefined, null])).toBe(false);
    expect(verifyMetaSignatureAny(body + " ", sign("meta-secret"), ["meta-secret"])).toBe(false);
  });

  it("extrae la cuenta (entry.id) y sus eventos", () => {
    const batches = parseIgWebhookPayload(body);
    expect(batches).toHaveLength(1);
    expect(batches[0].accountId).toBe("17841400000000001");
    expect(batches[0].events).toHaveLength(2);
    const [incoming, echo] = batches[0].events.map((ev) => parseIgEvent(batches[0].accountId, ev));
    expect(incoming).toMatchObject({ igsid: "9001", message: { externalId: "m1", direction: "in", body: "hola" } });
    expect(echo).toMatchObject({ igsid: "9001", message: { externalId: "m2", direction: "out" } });
  });

  it("ignora otros objetos, JSON roto e ids no numéricos", () => {
    expect(parseIgWebhookPayload("{")).toEqual([]);
    expect(parseIgWebhookPayload(JSON.stringify({ object: "page", entry: [{ id: "1", messaging: [{}] }] }))).toEqual([]);
    expect(parseIgWebhookPayload(JSON.stringify({ object: "instagram", entry: [{ id: "abc", messaging: [{ message: { mid: "x" } }] }] }))).toEqual([]);
    expect(parseIgWebhookPayload(JSON.stringify({ object: "instagram", entry: [{ id: "1", changes: [] }] }))).toEqual([]);
  });

  it("acota el tamaño (máx. 100 eventos por entrada)", () => {
    const many = JSON.stringify({ object: "instagram", entry: [{ id: "1", messaging: Array.from({ length: 150 }, (_, i) => ({ message: { mid: `m${i}` } })) }] });
    expect(parseIgWebhookPayload(many)[0].events).toHaveLength(100);
  });
});
