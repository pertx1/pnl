import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { hexToRgb01, luminance, pdfSafe } from "./core";
import type { ReportData } from "./data";

/**
 * PDF de marca blanca con pdf-lib (JS puro, sin navegador ni binarios nativos: funciona en funciones de Vercel).
 * Logo y color del brand kit del cliente. Sin marca de Kreo salvo un pie discreto opcional.
 */

export type PdfLabels = {
  title: string;
  period: string; // "{since} – {until}" ya formateado
  kpis: string;
  followers: string;
  growth: string;
  views: string;
  likes: string;
  published: string;
  followersChart: string;
  accounts: string;
  account: string;
  network: string;
  youtubeNote: string;
  topPosts: string;
  post: string;
  date: string;
  noPosts: string;
  noMetrics: string;
  sales: string;
  revenue: string;
  orders: string;
  aov: string;
  topProducts: string;
  product: string;
  units: string;
  multiCurrency: string;
  footer: string; // "Informe generado con Kreo"
  page: string; // "Página {n} de {total}" → se sustituye {n}/{total}
  metricsNote: string;
};

const A4 = { w: 595.28, h: 841.89 };
const M = 44;
const INK = rgb(0.07, 0.08, 0.05);
const MUTED = rgb(0.38, 0.41, 0.35);
const LINE = rgb(0.85, 0.87, 0.82);
const SOFT = rgb(0.96, 0.97, 0.94);

export async function renderReportPdf(data: NonNullable<ReportData>, opts: { labels: PdfLabels; locale: "es" | "en"; showFooter: boolean }): Promise<Uint8Array> {
  const L = opts.labels;
  const nf = new Intl.NumberFormat(opts.locale === "en" ? "en-GB" : "es-ES", { maximumFractionDigits: 1 });
  const cf = (cur: string) => new Intl.NumberFormat(opts.locale === "en" ? "en-GB" : "es-ES", { style: "currency", currency: cur, maximumFractionDigits: 2 });
  const df = new Intl.DateTimeFormat(opts.locale === "en" ? "en-GB" : "es-ES", { day: "2-digit", month: "short", timeZone: "UTC" });
  const n = (v: number | null) => (v === null ? "—" : nf.format(v));
  const signed = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${nf.format(v)}`);

  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`${data.project.name} · ${L.title}`));
  doc.setProducer("pdf-lib");
  doc.setCreator(pdfSafe(data.project.name));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Color de marca: primer color del brand kit. Si es muy claro, el texto de acento usa tinta oscura.
  const brand = hexToRgb01(data.brand.colors[0]) ?? { r: 0.29, g: 0.45, b: 0 };
  const accent = rgb(brand.r, brand.g, brand.b);
  const accentText: RGB = luminance(brand) > 0.5 ? INK : accent;

  const pages: PDFPage[] = [];
  let page = doc.addPage([A4.w, A4.h]);
  pages.push(page);
  let y = A4.h - M;

  const text = (s: string, x: number, yy: number, size = 10, f: PDFFont = font, color: RGB = INK) => page.drawText(pdfSafe(s, 300), { x, y: yy, size, font: f, color });
  const fit = (s: string, width: number, size: number, f: PDFFont = font) => {
    let t = pdfSafe(s, 300);
    while (t.length > 1 && f.widthOfTextAtSize(t, size) > width) t = `${t.slice(0, -2)}…`;
    return t;
  };
  const ensure = (needed: number) => {
    if (y - needed < M + 30) {
      page = doc.addPage([A4.w, A4.h]);
      pages.push(page);
      y = A4.h - M;
    }
  };
  const section = (title: string) => {
    ensure(40);
    y -= 26;
    page.drawRectangle({ x: M, y: y - 2, width: 3, height: 14, color: accent });
    text(title.toUpperCase(), M + 10, y, 10, bold, INK);
    y -= 14;
  };

  // --- Cabecera: logo + nombre + periodo ---
  let headerX = M;
  if (data.brand.logo) {
    try {
      const img = data.brand.logo.type === "png" ? await doc.embedPng(data.brand.logo.bytes) : await doc.embedJpg(data.brand.logo.bytes);
      const scale = Math.min(120 / img.width, 44 / img.height, 1);
      page.drawImage(img, { x: M, y: y - img.height * scale + 6, width: img.width * scale, height: img.height * scale });
      headerX = M + img.width * scale + 16;
    } catch {
      /* logo corrupto: se omite */
    }
  }
  text(fit(data.project.name, A4.w - headerX - M, 20, bold), headerX, y - 12, 20, bold);
  text(`${L.title} · ${L.period}`, headerX, y - 30, 10, font, MUTED);
  y -= 52;
  page.drawRectangle({ x: M, y, width: A4.w - 2 * M, height: 2, color: accent });

  // --- KPIs ---
  section(L.kpis);
  const kpis: [string, string][] = [
    [L.followers, n(data.kpis.followers)],
    [L.growth, signed(data.kpis.growth)],
    [L.views, n(data.kpis.views)],
    [L.published, String(data.publishedCount)],
  ];
  const tileW = (A4.w - 2 * M - 3 * 10) / 4;
  ensure(64);
  kpis.forEach(([label, value], i) => {
    const x = M + i * (tileW + 10);
    page.drawRectangle({ x, y: y - 56, width: tileW, height: 56, color: SOFT, borderColor: LINE, borderWidth: 0.6 });
    text(fit(label.toUpperCase(), tileW - 16, 7.5, bold), x + 8, y - 16, 7.5, bold, MUTED);
    text(fit(value, tileW - 16, 18, bold), x + 8, y - 42, 18, bold, i === 1 ? accentText : INK);
  });
  y -= 64;
  text(L.metricsNote, M, y - 8, 7.5, font, MUTED);
  y -= 10;
  if (data.hasYouTube) {
    text(L.youtubeNote, M, y - 8, 7.5, font, MUTED);
    y -= 10;
  }

  // --- Gráfica de seguidores (una serie, color de marca) ---
  if (data.followersByDay.length >= 2) {
    section(L.followersChart);
    const h = 110;
    ensure(h + 10);
    const top = y - 6;
    const w = A4.w - 2 * M;
    const vals = data.followersByDay.map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const lo = min === max ? min * 0.98 : min - (max - min) * 0.1;
    const hi = min === max ? max * 1.02 + 1 : max + (max - min) * 0.1;
    const px = (i: number) => M + 40 + (i * (w - 48)) / (vals.length - 1);
    const py = (v: number) => top - h + 16 + ((v - lo) / (hi - lo || 1)) * (h - 24);
    for (const f of [0, 0.5, 1]) {
      const v = lo + (hi - lo) * f;
      page.drawLine({ start: { x: M + 40, y: py(v) }, end: { x: M + w, y: py(v) }, thickness: 0.4, color: LINE, dashArray: [2, 2] });
      text(nf.format(Math.round(v)), M, py(v) - 3, 7, font, MUTED);
    }
    for (let i = 1; i < vals.length; i++) page.drawLine({ start: { x: px(i - 1), y: py(vals[i - 1]) }, end: { x: px(i), y: py(vals[i]) }, thickness: 1.6, color: accent });
    text(df.format(new Date(data.followersByDay[0].day)), M + 40, top - h + 2, 7, font, MUTED);
    const lastLabel = df.format(new Date(data.followersByDay.at(-1)!.day));
    text(lastLabel, M + w - font.widthOfTextAtSize(pdfSafe(lastLabel), 7), top - h + 2, 7, font, MUTED);
    y = top - h - 4;
  }

  // --- Tabla genérica ---
  const table = (cols: { label: string; width: number; align?: "right" }[], rows: string[][]) => {
    ensure(22);
    let x = M;
    for (const c of cols) {
      const lbl = fit(c.label.toUpperCase(), c.width - 6, 7.5, bold);
      text(lbl, c.align === "right" ? x + c.width - bold.widthOfTextAtSize(lbl, 7.5) - 4 : x, y - 10, 7.5, bold, MUTED);
      x += c.width;
    }
    y -= 16;
    page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.6, color: LINE });
    for (const r of rows) {
      ensure(18);
      x = M;
      r.forEach((cell, i) => {
        const c = cols[i];
        const s = fit(cell, c.width - 8, 9);
        text(s, c.align === "right" ? x + c.width - font.widthOfTextAtSize(s, 9) - 4 : x, y - 12, 9);
        x += c.width;
      });
      y -= 18;
      page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.3, color: LINE });
    }
  };
  const W = A4.w - 2 * M;

  // --- Cuentas ---
  section(L.accounts);
  if (data.accounts.length) {
    table(
      [
        { label: L.account, width: W * 0.34 },
        { label: L.network, width: W * 0.16 },
        { label: L.followers, width: W * 0.17, align: "right" },
        { label: L.growth, width: W * 0.15, align: "right" },
        { label: L.views, width: W * 0.18, align: "right" },
      ],
      data.accounts.map((a) => [a.name, a.platform, n(a.followers), signed(a.growth), n(a.views)]),
    );
  } else {
    text(L.noMetrics, M, y - 12, 9, font, MUTED);
    y -= 18;
  }

  // --- Mejores publicaciones ---
  section(L.topPosts);
  if (data.topPosts.length) {
    table(
      [
        { label: L.post, width: W * 0.46 },
        { label: L.network, width: W * 0.16 },
        { label: L.date, width: W * 0.14 },
        { label: L.views, width: W * 0.12, align: "right" },
        { label: L.likes, width: W * 0.12, align: "right" },
      ],
      data.topPosts.map((p) => [p.text || "—", `${p.platform}${p.account ? ` ${p.account}` : ""}`, p.publishedAt ? df.format(new Date(p.publishedAt)) : "—", n(p.views), n(p.likes)]),
    );
  } else {
    text(L.noPosts, M, y - 12, 9, font, MUTED);
    y -= 18;
  }

  // --- Ventas (Shopify) ---
  if (data.sales && data.sales.currency) {
    const s = data.sales;
    const c = cf(s.currency!);
    section(L.sales);
    ensure(64);
    const tiles: [string, string][] = [
      [L.revenue, c.format(s.revenue)],
      [L.orders, String(s.orders)],
      [L.aov, c.format(s.aov)],
    ];
    const tw = (W - 2 * 10) / 3;
    tiles.forEach(([label, value], i) => {
      const x = M + i * (tw + 10);
      page.drawRectangle({ x, y: y - 56, width: tw, height: 56, color: SOFT, borderColor: LINE, borderWidth: 0.6 });
      text(fit(label.toUpperCase(), tw - 16, 7.5, bold), x + 8, y - 16, 7.5, bold, MUTED);
      text(fit(value, tw - 16, 18, bold), x + 8, y - 42, 18, bold);
    });
    y -= 64;
    if (s.otherCurrencies) {
      text(L.multiCurrency, M, y - 8, 7.5, font, MUTED);
      y -= 10;
    }
    if (s.topProducts.length) {
      y -= 8;
      text(L.topProducts.toUpperCase(), M, y - 8, 7.5, bold, MUTED);
      y -= 12;
      table(
        [
          { label: L.product, width: W * 0.7 },
          { label: L.units, width: W * 0.15, align: "right" },
          { label: L.orders, width: W * 0.15, align: "right" },
        ],
        s.topProducts.slice(0, 8).map((p) => [p.title, String(p.quantity), String(p.orders)]),
      );
    }
  }

  // --- Pie: paginación + marca discreta opcional ---
  pages.forEach((p, i) => {
    const label = pdfSafe(L.page.replace("{n}", String(i + 1)).replace("{total}", String(pages.length)));
    p.drawText(label, { x: A4.w - M - font.widthOfTextAtSize(label, 7.5), y: 24, size: 7.5, font, color: MUTED });
    if (opts.showFooter) p.drawText(pdfSafe(L.footer), { x: M, y: 24, size: 7.5, font, color: MUTED });
  });
  return doc.save();
}
