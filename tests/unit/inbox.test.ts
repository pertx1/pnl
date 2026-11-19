import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMetaSignature, verifySubscription, appSecretProof } from "@/lib/inbox/meta-signature";
import { buildReplyMime, extractGmailText, fromBase64Url, htmlToText, isValidEmail, parseAddress, replySubject, stripQuoted, toBase64Url } from "@/lib/inbox/mime";
import { emailFromIdToken } from "@/lib/inbox/providers/outlook";
import { parseIgEvent } from "@/lib/inbox/sync";
import { fitsInstagram, messagingWindow } from "@/lib/inbox/window";

const H = 3600_000;

describe("ventana de mensajería de Instagram", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  it("dentro de 24 h → RESPONSE", () => {
    const w = messagingWindow(new Date(now.getTime() - 23 * H), now, false);
    expect(w.canSend).toBe(true);
    expect(w.mode).toBe("response");
  });
  it("después de 24 h sin HUMAN_AGENT → cerrada", () => {
    const w = messagingWindow(new Date(now.getTime() - 25 * H), now, false);
    expect(w).toMatchObject({ canSend: false, mode: "closed" });
  });
  it("después de 24 h con HUMAN_AGENT aprobado → hasta 7 días", () => {
    expect(messagingWindow(new Date(now.getTime() - 3 * 24 * H), now, true)).toMatchObject({ canSend: true, mode: "human_agent" });
    expect(messagingWindow(new Date(now.getTime() - 8 * 24 * H), now, true)).toMatchObject({ canSend: false, mode: "closed" });
  });
  it("sin mensaje entrante nunca se puede enviar (nada de mensajes en frío)", () => {
    expect(messagingWindow(null, now, true).canSend).toBe(false);
    expect(messagingWindow("no-es-fecha", now, true).canSend).toBe(false);
  });
  it("límite de 1.000 bytes del DM", () => {
    expect(fitsInstagram("a".repeat(1000))).toBe(true);
    expect(fitsInstagram("a".repeat(1001))).toBe(false);
    expect(fitsInstagram("ñ".repeat(600))).toBe(false); // 2 bytes por carácter
  });
});

describe("webhook de Meta", () => {
  const secret = "app-secret";
  const body = JSON.stringify({ object: "instagram", entry: [{ id: "1", messaging: [] }] });
  const sig = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  it("acepta la firma correcta y rechaza cualquier alteración", () => {
    expect(verifyMetaSignature(body, sig, secret)).toBe(true);
    expect(verifyMetaSignature(body + " ", sig, secret)).toBe(false);
    expect(verifyMetaSignature(body, sig, "otro")).toBe(false);
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(body, sig.replace("sha256=", "sha1="), secret)).toBe(false);
    expect(verifyMetaSignature(body, sig, "")).toBe(false);
  });
  it("verificación de la suscripción con verify token", () => {
    const ok = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "123" });
    expect(verifySubscription(ok, "tok")).toBe("123");
    expect(verifySubscription(ok, "otro")).toBeNull();
    expect(verifySubscription(ok, "")).toBeNull();
    expect(verifySubscription(new URLSearchParams({ "hub.mode": "unsubscribe", "hub.verify_token": "tok", "hub.challenge": "1" }), "tok")).toBeNull();
  });
  it("appsecret_proof = HMAC-SHA256(token, app secret)", () => {
    expect(appSecretProof("t", "s")).toBe(createHmac("sha256", "s").update("t").digest("hex"));
  });
  it("normaliza mensajes entrantes y ecos; ignora borrados y eventos sin mensaje", () => {
    const inbound = parseIgEvent("IG1", { sender: { id: "U1" }, recipient: { id: "IG1" }, timestamp: 1_700_000_000_000, message: { mid: "m1", text: "Hola" } });
    expect(inbound).toMatchObject({ igsid: "U1", message: { direction: "in", body: "Hola", externalId: "m1" } });
    const echo = parseIgEvent("IG1", { sender: { id: "IG1" }, recipient: { id: "U1" }, message: { mid: "m2", text: "Gracias", is_echo: true } });
    expect(echo).toMatchObject({ igsid: "U1", message: { direction: "out" } });
    expect(parseIgEvent("IG1", { sender: { id: "U1" }, message: { mid: "m3", is_deleted: true } })).toBeNull();
    expect(parseIgEvent("IG1", { sender: { id: "U1" } })).toBeNull();
    expect(parseIgEvent("IG1", { sender: { id: "U1" }, message: { mid: "m4", attachments: [{ type: "image" }] } })?.message.body).toBe("[image]");
  });
});

describe("email: respuesta en el mismo hilo", () => {
  it("construye un MIME válido con In-Reply-To/References y asunto Re:", () => {
    const mime = buildReplyMime({ to: "ana@example.com", subject: "Pedido 123", inReplyTo: "<abc@mail>", references: "<x@mail>", body: "Hola Ana\nGracias" });
    expect(mime).toContain("To: ana@example.com");
    expect(mime).toContain("Subject: Re: Pedido 123");
    expect(mime).toContain("In-Reply-To: <abc@mail>");
    expect(mime).toContain("References: <x@mail> <abc@mail>");
    const body = mime.split("\r\n\r\n")[1].replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toBe("Hola Ana\r\nGracias");
  });
  it("evita la inyección de cabeceras y codifica asuntos no ASCII", () => {
    const mime = buildReplyMime({ to: "ana@example.com", subject: "Hola\r\nBcc: spam@x.com", body: "x" });
    expect(mime).not.toMatch(/\r\nBcc:/);
    const enc = buildReplyMime({ to: "ana@example.com", subject: "Envío rápido", body: "x" });
    expect(enc).toMatch(/Subject: =\?UTF-8\?B\?/);
  });
  it("rechaza destinatarios no válidos (no se puede escribir a direcciones inventadas)", () => {
    expect(() => buildReplyMime({ to: "no-es-email", subject: "", body: "x" })).toThrow();
    expect(() => buildReplyMime({ to: "a@b.com, c@d.com", subject: "", body: "x" })).toThrow();
    expect(isValidEmail("a@b.co")).toBe(true);
  });
  it("Re: no se duplica", () => {
    expect(replySubject("RE: hola")).toBe("RE: hola");
    expect(replySubject(null)).toBe("Re:");
  });
  it("parsea direcciones", () => {
    expect(parseAddress('"Ana López" <Ana@Example.com>')).toEqual({ name: "Ana López", email: "ana@example.com" });
    expect(parseAddress("ana@example.com")).toEqual({ name: null, email: "ana@example.com" });
    expect(parseAddress(null)).toEqual({ name: null, email: null });
  });
  it("extrae el texto de Gmail (text/plain primero; si no, HTML a texto)", () => {
    const plain = { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: toBase64Url("Hola") } }, { mimeType: "text/html", body: { data: toBase64Url("<b>Hola</b>") } }] };
    expect(extractGmailText(plain)).toBe("Hola");
    const html = { mimeType: "text/html", body: { data: toBase64Url("<p>Hola &amp; adiós</p><script>alert(1)</script>") } };
    expect(extractGmailText(html)).toBe("Hola & adiós");
    expect(fromBase64Url(toBase64Url("ñ"))).toBe("ñ");
    expect(htmlToText("a<br>b")).toBe("a\nb");
  });
  it("quita el texto citado", () => {
    expect(stripQuoted("Gracias!\n\nEl lun, 1 dic, Ana escribió:\n> hola")).toBe("Gracias!");
    expect(stripQuoted("Ok\n> citado\nfin")).toBe("Ok\nfin");
  });
  it("lee el email del id_token de Microsoft solo para mostrarlo", () => {
    const tok = (p: object) => `x.${Buffer.from(JSON.stringify(p)).toString("base64url")}.y`;
    expect(emailFromIdToken(tok({ email: "Ana@Outlook.com" }))).toBe("ana@outlook.com");
    expect(emailFromIdToken(tok({ preferred_username: "ana@contoso.com" }))).toBe("ana@contoso.com");
    expect(emailFromIdToken(tok({ preferred_username: "sin-arroba" }))).toBeNull();
    expect(emailFromIdToken("basura")).toBeNull();
  });
});
