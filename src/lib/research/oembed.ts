import "server-only";
import { graphVersion, metaOembedToken } from "./config";
import { researchJson } from "./http";
import { safeHttpsUrl, type SwipeNetwork } from "./parse";

/**
 * Metadatos públicos de un enlace vía oEmbed OFICIAL (título, autor, miniatura). No descargamos ni redistribuimos
 * el contenido: guardamos solo el enlace y la URL de la miniatura que la propia plataforma ofrece para incrustar.
 * - YouTube: https://www.youtube.com/oembed (público)
 * - TikTok:  https://www.tiktok.com/oembed (público)
 * - Instagram: Graph `instagram_oembed` con token de app (META_APP_ID|META_CLIENT_TOKEN). Sin token → solo URL.
 */
export type OembedMeta = { title: string | null; authorName: string | null; thumbnailUrl: string | null };

function endpoint(network: SwipeNetwork, url: string): { url: string; init?: RequestInit } | null {
  const u = encodeURIComponent(url);
  if (network === "youtube") return { url: `https://www.youtube.com/oembed?format=json&url=${u}` };
  if (network === "tiktok") return { url: `https://www.tiktok.com/oembed?url=${u}` };
  if (network === "instagram") {
    const token = metaOembedToken();
    if (!token) return null;
    return {
      url: `https://graph.facebook.com/${graphVersion()}/instagram_oembed?omitscript=true&url=${u}&fields=title,author_name,thumbnail_url`,
      init: { headers: { Authorization: `Bearer ${token}` } },
    };
  }
  return null;
}

export function hasOembed(network: SwipeNetwork) {
  return network === "youtube" || network === "tiktok" || (network === "instagram" && Boolean(metaOembedToken()));
}

/** Devuelve null si la red no tiene oEmbed disponible o si falla (el enlace se guarda igualmente). */
export async function fetchOembed(network: SwipeNetwork, url: string): Promise<OembedMeta | null> {
  const ep = endpoint(network, url);
  if (!ep) return null;
  try {
    const json = await researchJson<{ title?: string; author_name?: string; thumbnail_url?: string }>(`oembed_${network}`, ep.url, ep.init);
    return {
      title: json.title ? String(json.title).slice(0, 500) : null,
      authorName: json.author_name ? String(json.author_name).slice(0, 300) : null,
      thumbnailUrl: json.thumbnail_url ? safeHttpsUrl(String(json.thumbnail_url)) : null,
    };
  } catch {
    return null;
  }
}
