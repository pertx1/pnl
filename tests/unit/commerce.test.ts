import { createHmac, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { bearerFrom, generateApiKey, hashApiKey, isWellFormedKey } from "@/lib/mcp/keys";
import { aggregateMetrics, hexToRgb01, lastDays, nextRunAt, parseRecipients, pdfSafe, periodFor } from "@/lib/reports/core";
import {
  attributeOrders,
  buildUtmUrl,
  minimizeGraphqlOrder,
  minimizeWebhookOrder,
  normalizeShopDomain,
  parseLanding,
  salesSummary,
  sanitizeDiscountCode,
  verifyQueryHmac,
  verifyWebhookHmac,
} from "@/lib/shopify/core";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("Shopify: dominio y HMAC", () => {
  it("normaliza y valida el dominio de la tienda", () => {
    expect(normalizeShopDomain("Mi-Tienda")).toBe("mi-tienda.myshopify.com");
    expect(normalizeShopDomain("https://mi-tienda.myshopify.com/admin")).toBe("mi-tienda.myshopify.com");
    expect(normalizeShopDomain("mi-tienda.myshopify.com.attacker.example")).toBeNull();
    expect(normalizeShopDomain("evil.com")).toBeNull();
    expect(normalizeShopDomain("")).toBeNull();
  });

  it("verifica el HMAC de la query del OAuth (orden alfabético, sin hmac)", () => {
    const secret = "shh";
    const msg = "code=abc&shop=t.myshopify.com&state=xyz&timestamp=1";
    const hmac = createHmac("sha256", secret).update(msg).digest("hex");
    const ok = new URLSearchParams({ state: "xyz", shop: "t.myshopify.com", code: "abc", timestamp: "1", hmac });
    expect(verifyQueryHmac(ok, secret)).toBe(true);
    const tampered = new URLSearchParams(ok);
    tampered.set("shop", "otra.myshopify.com");
    expect(verifyQueryHmac(tampered, secret)).toBe(false);
    expect(verifyQueryHmac(new URLSearchParams({ shop: "t.myshopify.com" }), secret)).toBe(false);
  });

  it("verifica el HMAC (base64) de los webhooks sobre el cuerpo crudo", () => {
    const body = JSON.stringify({ id: 1 });
    const header = createHmac("sha256", "s").update(body).digest("base64");
    expect(verifyWebhookHmac(body, header, "s")).toBe(true);
    expect(verifyWebhookHmac(`${body} `, header, "s")).toBe(false);
    expect(verifyWebhookHmac(body, null, "s")).toBe(false);
  });
});

describe("Shopify: minimización de pedidos (sin datos de clientes)", () => {
  it("el webhook solo conserva campos de la lista blanca", () => {
    const o = minimizeWebhookOrder({
      id: 4501,
      name: "#1001",
      created_at: "2026-11-10T10:00:00Z",
      current_total_price: "49.90",
      currency: "EUR",
      discount_codes: [{ code: "ana10" }],
      landing_site: "/products/x?utm_source=kreo&utm_campaign=p1&email=cliente@x.com",
      line_items: [{ product_id: 7, title: "Camiseta", quantity: 2 }],
      // Campos personales que NO deben pasar:
      ...({ email: "cliente@x.com", customer: { first_name: "Ana" }, shipping_address: { address1: "Calle 1" } } as object),
    });
    expect(o).not.toBeNull();
    const s = JSON.stringify(o);
    expect(s).not.toContain("cliente@x.com");
    expect(s).not.toContain("Calle 1");
    expect(s).not.toContain("Ana\"");
    expect(o!.discountCodes).toEqual(["ANA10"]);
    expect(o!.utm.campaign).toBe("p1");
    expect(o!.landingPath).toBe("/products/x");
    expect(o!.total).toBe(49.9);
  });

  it("convierte un pedido de GraphQL", () => {
    const o = minimizeGraphqlOrder({
      id: "gid://shopify/Order/99",
      name: "#2",
      createdAt: "2026-11-11T00:00:00Z",
      discountCodes: [],
      currentTotalPriceSet: { shopMoney: { amount: "10.00", currencyCode: "USD" } },
      customerJourneySummary: { lastVisit: { landingPage: "https://s.com/?utm_campaign=abc", utmParameters: null } },
      lineItems: { nodes: [{ title: "Taza", quantity: 1, product: { id: "gid://shopify/Product/5" } }] },
    });
    expect(o).toMatchObject({ shopifyOrderId: 99, currency: "USD", total: 10, utm: { campaign: "abc" }, lineItems: [{ productId: "5", quantity: 1 }] });
  });

  it("parseLanding descarta parámetros que no son UTM", () => {
    expect(parseLanding("/?token=secreto&utm_medium=social")).toEqual({ path: "/", utm: { source: null, medium: "social", campaign: null, content: null } });
  });
});

describe("Shopify: atribución", () => {
  it("genera enlaces UTM solo https", () => {
    expect(buildUtmUrl("https://t.com/p?a=1", { source: "kreo", medium: "social", campaign: "post-1" })).toBe("https://t.com/p?a=1&utm_source=kreo&utm_medium=social&utm_campaign=post-1");
    expect(buildUtmUrl("http://t.com", { source: "k", medium: "m", campaign: "c" })).toBeNull();
    expect(buildUtmUrl("javascript:alert(1)", { source: "k", medium: "m", campaign: "c" })).toBeNull();
  });

  it("sanea códigos de descuento", () => {
    expect(sanitizeDiscountCode("ana garcía 10")).toBe("ANA-GARCIA-10");
    expect(sanitizeDiscountCode("a")).toBeNull();
  });

  it("atribuye pedidos por código y por utm_campaign, sin pruebas ni cancelados", () => {
    const rules = [
      { id: "r1", kind: "discount" as const, utmCampaign: null, discountCode: "ANA10" },
      { id: "r2", kind: "utm" as const, utmCampaign: "post-1", discountCode: null },
    ];
    const base = { currency: "EUR", cancelled: false, test: false };
    const res = attributeOrders(rules, [
      { ...base, total: 10, discountCodes: ["ANA10"], utmCampaign: "post-1" },
      { ...base, total: 5, discountCodes: [], utmCampaign: "post-1" },
      { ...base, total: 100, discountCodes: ["ANA10"], utmCampaign: null, test: true },
      { ...base, total: 100, discountCodes: ["ANA10"], utmCampaign: null, cancelled: true },
    ]);
    expect(res.get("r1")).toEqual({ orders: 1, revenue: { EUR: 10 } });
    expect(res.get("r2")).toEqual({ orders: 2, revenue: { EUR: 15 } });
  });

  it("resume ventas y productos top en la moneda principal", () => {
    const s = salesSummary([
      { orderedAt: "2026-11-01T10:00:00Z", total: 20, currency: "EUR", cancelled: false, test: false, lineItems: [{ productId: "1", title: "A", quantity: 2 }] },
      { orderedAt: "2026-11-01T12:00:00Z", total: 10, currency: "EUR", cancelled: false, test: false, lineItems: [{ productId: "2", title: "B", quantity: 1 }] },
      { orderedAt: "2026-11-02T12:00:00Z", total: 99, currency: "USD", cancelled: false, test: false, lineItems: [] },
    ]);
    expect(s.currency).toBe("EUR");
    expect(s.revenue).toBe(30);
    expect(s.aov).toBe(15);
    expect(s.otherCurrencies).toBe(true);
    expect(s.byDay).toEqual([{ day: "2026-11-01", value: 30 }]);
    expect(s.topProducts[0]).toMatchObject({ title: "A", quantity: 2 });
  });
});

describe("Informes", () => {
  it("calcula los periodos semanal y mensual", () => {
    const now = new Date("2026-11-16T07:05:00Z"); // lunes
    expect(periodFor("weekly", now)).toEqual({ since: "2026-11-09", until: "2026-11-15" });
    expect(periodFor("monthly", new Date("2026-03-01T07:00:00Z"))).toEqual({ since: "2026-02-01", until: "2026-02-28" });
    expect(lastDays(7, now)).toEqual({ since: "2026-11-10", until: "2026-11-16" });
  });

  it("programa el siguiente envío estrictamente en el futuro", () => {
    expect(nextRunAt("weekly", new Date("2026-11-19T10:00:00Z")).toISOString()).toBe("2026-11-23T07:00:00.000Z");
    expect(nextRunAt("weekly", new Date("2026-11-23T07:00:00Z")).toISOString()).toBe("2026-11-30T07:00:00.000Z");
    expect(nextRunAt("weekly", new Date("2026-11-23T06:00:00Z")).toISOString()).toBe("2026-11-23T07:00:00.000Z");
    expect(nextRunAt("monthly", new Date("2026-12-15T00:00:00Z")).toISOString()).toBe("2027-01-01T07:00:00.000Z");
  });

  it("deja el texto apto para PDF (sin emojis) y lee colores", () => {
    expect(pdfSafe("Hola 🚀 niño — “ok”\n€")).toBe("Hola niño — “ok” €");
    expect(pdfSafe("x".repeat(20), 10)).toHaveLength(10);
    expect(hexToRgb01("#fff")).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToRgb01("nope")).toBeNull();
  });

  it("no suma YouTube a los totales", () => {
    const agg = aggregateMetrics(
      [
        { accountId: "tt", platform: "tiktok", day: "2026-11-01", followers: 100, views: 10, likes: 1 },
        { accountId: "tt", platform: "tiktok", day: "2026-11-07", followers: 150, views: 20, likes: 2 },
        { accountId: "yt", platform: "youtube", day: "2026-11-07", followers: 9999, views: 9999, likes: null },
      ],
      "2026-11-01",
      "2026-11-07",
    );
    expect(agg.totals).toEqual({ followers: 150, views: 20, likes: 2, growth: 50 });
    expect(agg.hasYouTube).toBe(true);
    expect(agg.accounts.find((a) => a.accountId === "yt")?.followers).toBe(9999);
  });

  it("valida destinatarios", () => {
    expect(parseRecipients("A@x.com, b@y.es; a@x.com")).toEqual(["a@x.com", "b@y.es"]);
    expect(parseRecipients("no-es-email")).toBeNull();
    expect(parseRecipients(Array.from({ length: 11 }, (_, i) => `u${i}@x.com`).join(","))).toBeNull();
  });

  it("firma y verifica los enlaces (descarga caduca; manipulación detectada)", async () => {
    const { readReportToken, signReportToken } = await import("@/lib/reports/link");
    const t = signReportToken({ k: "dl", s: "id", from: "2026-11-01", to: "2026-11-07", exp: Date.now() + 1000 });
    expect(readReportToken(t)).toMatchObject({ k: "dl", s: "id" });
    expect(readReportToken(`${t}x`)).toBeNull();
    expect(readReportToken(signReportToken({ k: "dl", s: "id", from: "a", to: "b", exp: Date.now() - 1 }))).toBeNull();
    expect(readReportToken(signReportToken({ k: "unsub", s: "id", e: "h" }))).toMatchObject({ k: "unsub" });
  });

  it("genera un PDF válido aunque falten datos", async () => {
    const { renderReportPdf } = await import("@/lib/reports/pdf");
    const es = (await import("../../messages/modules/commerce/es.json")).default;
    const bytes = await renderReportPdf(
      {
        project: { id: "p", name: "Marca 🚀 Ñandú", workspaceId: "w" },
        period: { since: "2026-11-01", until: "2026-11-07" },
        brand: { logo: null, colors: ["#C6F432"] },
        kpis: { followers: 150, views: 20, likes: 2, growth: 50 },
        hasYouTube: true,
        followersByDay: [
          { day: "2026-11-01", value: 100 },
          { day: "2026-11-07", value: 150 },
        ],
        accounts: [{ accountId: "tt", platform: "tiktok", followers: 150, views: 20, likes: 2, growth: 50, name: "@marca" }],
        publishedCount: 1,
        topPosts: [{ id: "x", text: "Post con emoji 😀", platform: "tiktok", account: "@marca", publishedAt: "2026-11-02T00:00:00Z", url: null, views: null, likes: null }],
        sales: salesSummary([{ orderedAt: "2026-11-01T10:00:00Z", total: 20, currency: "EUR", cancelled: false, test: false, lineItems: [{ productId: "1", title: "A", quantity: 2 }] }]),
      },
      { labels: { ...es.commerce.pdf, period: "1–7 nov 2026" }, locale: "es", showFooter: true },
    );
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });
});

describe("MCP: API keys", () => {
  it("genera claves con prefijo visible y guarda solo el hash", () => {
    const { key, prefix, hash } = generateApiKey();
    expect(isWellFormedKey(key)).toBe(true);
    expect(key.startsWith(prefix)).toBe(true);
    expect(hash).toBe(hashApiKey(key));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(key.slice(8));
  });

  it("lee la cabecera Authorization: Bearer", () => {
    const { key } = generateApiKey();
    expect(bearerFrom(`Bearer ${key}`)).toBe(key);
    expect(bearerFrom(`bearer ${key}`)).toBe(key);
    expect(bearerFrom("Bearer otro-token")).toBeNull();
    expect(bearerFrom(null)).toBeNull();
  });
});
