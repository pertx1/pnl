import "server-only";
import { adLibraryToken, graphVersion, isAdLibraryConfigured } from "../config";
import { researchJson } from "../http";
import type { AdResult, AdSource } from "./types";

/**
 * Meta Ad Library API (Graph `/ads_archive`). En la UE la transparencia cubre TODOS los anuncios (DSA art. 39),
 * así que se puede usar ad_type=ALL con ad_reached_countries de un país UE. Campos y parámetros verificados en
 * https://developers.facebook.com/docs/graph-api/reference/ads_archive y /archived-ad (2026-11-19).
 * Requiere el token de un usuario que haya completado la verificación de identidad de Meta y aceptado
 * las condiciones de la Ad Library API (https://www.facebook.com/ads/library/api).
 */
const FIELDS = [
  "id",
  "ad_creation_time",
  "ad_creative_bodies",
  "ad_creative_link_titles",
  "ad_creative_link_captions",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "languages",
  "page_id",
  "page_name",
  "publisher_platforms",
  "eu_total_reach", // solo anuncios UE
  "target_locations", // UE/UK
].join(",");

type Raw = {
  id: string;
  page_id?: string;
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_captions?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  languages?: string[];
  publisher_platforms?: string[];
  eu_total_reach?: number;
  target_locations?: { name?: string; type?: string; excluded?: boolean }[];
};

const clip = (arr: string[] | undefined, n = 3, len = 600) => (arr ?? []).slice(0, n).map((s) => String(s).slice(0, len));

export const metaAdLibrary: AdSource = {
  id: "meta_ad_library",
  label: "Meta Ad Library",
  isConfigured: isAdLibraryConfigured,
  async search(q) {
    const p = new URLSearchParams({
      search_terms: q.terms.slice(0, 100),
      search_type: q.exactPhrase ? "KEYWORD_EXACT_PHRASE" : "KEYWORD_UNORDERED",
      ad_type: "ALL",
      ad_active_status: q.status,
      ad_reached_countries: JSON.stringify([q.country]),
      fields: FIELDS,
      limit: "50",
    });
    if (q.language) p.set("languages", JSON.stringify([q.language]));
    if (q.platform) p.set("publisher_platforms", JSON.stringify([q.platform]));
    if (q.dateMin) p.set("ad_delivery_date_min", q.dateMin);
    if (q.dateMax) p.set("ad_delivery_date_max", q.dateMax);
    if (q.after) p.set("after", q.after);
    const json = await researchJson<{ data?: Raw[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      "meta_ad_library",
      `https://graph.facebook.com/${graphVersion()}/ads_archive?${p}`,
      { headers: { Authorization: `Bearer ${adLibraryToken()}` } },
    );
    const ads: AdResult[] = (json.data ?? []).map((a) => ({
      id: a.id,
      pageId: a.page_id ?? "",
      pageName: (a.page_name ?? "").slice(0, 300),
      bodies: clip(a.ad_creative_bodies),
      linkTitles: clip(a.ad_creative_link_titles, 3, 200),
      linkCaptions: clip(a.ad_creative_link_captions, 3, 200),
      libraryUrl: `https://www.facebook.com/ads/library/?id=${encodeURIComponent(a.id)}`,
      startedAt: a.ad_delivery_start_time ?? null,
      stoppedAt: a.ad_delivery_stop_time ?? null,
      platforms: (a.publisher_platforms ?? []).map((x) => String(x).toLowerCase()),
      languages: a.languages ?? [],
      countries: (a.target_locations ?? []).filter((l) => !l.excluded && l.name).map((l) => String(l.name).slice(0, 80)),
      euReach: typeof a.eu_total_reach === "number" ? a.eu_total_reach : null,
    }));
    return { ads, nextCursor: json.paging?.next ? (json.paging.cursors?.after ?? null) : null };
  },
};
