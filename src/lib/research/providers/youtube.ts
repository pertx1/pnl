import "server-only";
import { isYouTubeConfigured, youtubeApiKey } from "../config";
import { researchJson, ResearchError } from "../http";
import { parseYouTubeInput } from "../parse";
import type { PostSnapshot, ProfileSnapshot, PublicDataProvider } from "./types";

/**
 * YouTube Data API v3 con clave de API (solo datos públicos). Coste de cuota por perfil: 3 unidades
 * (channels.list 1 + playlistItems.list 1 + videos.list 1). Nunca usamos search.list (100 unidades).
 * Los datos son "Non-Authorized Data": se refrescan o borran en ≤ 30 días (Developer Policies III.E.4).
 */
const API = "https://www.googleapis.com/youtube/v3";
const MAX_VIDEOS = 50;

type Channel = {
  id: string;
  snippet: { title: string; customUrl?: string; thumbnails?: Record<string, { url: string }> };
  statistics?: { viewCount?: string; subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

const num = (v?: string) => (v === undefined || v === null || v === "" ? null : Number(v));

async function fetchChannel(ref: { kind: "handle" | "id"; value: string }): Promise<Channel> {
  const p = new URLSearchParams({
    part: "snippet,statistics,contentDetails",
    key: youtubeApiKey(),
    fields: "items(id,snippet(title,customUrl,thumbnails/default/url),statistics,contentDetails/relatedPlaylists/uploads)",
  });
  p.set(ref.kind === "handle" ? "forHandle" : "id", ref.value);
  const json = await researchJson<{ items?: Channel[] }>("youtube", `${API}/channels?${p}`);
  const ch = json.items?.[0];
  if (!ch) throw new ResearchError("youtube", "not_found");
  return ch;
}

async function fetchVideos(uploads: string): Promise<PostSnapshot[]> {
  const p = new URLSearchParams({ part: "contentDetails", playlistId: uploads, maxResults: String(MAX_VIDEOS), key: youtubeApiKey(), fields: "items/contentDetails/videoId" });
  const list = await researchJson<{ items?: { contentDetails: { videoId: string } }[] }>("youtube", `${API}/playlistItems?${p}`).catch((e) => {
    // Canal sin vídeos públicos → la playlist de subidas no existe.
    if (e instanceof ResearchError && e.code === "not_found") return { items: [] };
    throw e;
  });
  const ids = (list.items ?? []).map((i) => i.contentDetails.videoId).filter(Boolean);
  if (!ids.length) return [];
  const v = new URLSearchParams({
    part: "snippet,statistics",
    id: ids.join(","),
    key: youtubeApiKey(),
    fields: "items(id,snippet(title,publishedAt,thumbnails/medium/url,liveBroadcastContent),statistics(viewCount,likeCount,commentCount))",
  });
  const videos = await researchJson<{
    items?: { id: string; snippet: { title: string; publishedAt: string; thumbnails?: { medium?: { url: string } } }; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[];
  }>("youtube", `${API}/videos?${v}`);
  return (videos.items ?? []).map((x) => ({
    externalId: x.id,
    title: x.snippet.title?.slice(0, 1000) ?? null,
    url: `https://www.youtube.com/watch?v=${x.id}`,
    thumbnailUrl: x.snippet.thumbnails?.medium?.url ?? null,
    mediaType: "video",
    publishedAt: x.snippet.publishedAt ?? null,
    views: num(x.statistics?.viewCount),
    likes: num(x.statistics?.likeCount),
    comments: num(x.statistics?.commentCount),
  }));
}

async function snapshot(ref: { kind: "handle" | "id"; value: string }): Promise<ProfileSnapshot> {
  if (!isYouTubeConfigured()) throw new ResearchError("youtube", "not_configured");
  const ch = await fetchChannel(ref);
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
  const posts = uploads ? await fetchVideos(uploads) : [];
  const handle = ch.snippet.customUrl ?? null;
  return {
    externalId: ch.id,
    handle,
    displayName: ch.snippet.title ?? null,
    avatarUrl: ch.snippet.thumbnails?.default?.url ?? null,
    profileUrl: handle ? `https://www.youtube.com/${handle.startsWith("@") ? handle : `@${handle}`}` : `https://www.youtube.com/channel/${ch.id}`,
    followers: ch.statistics?.hiddenSubscriberCount ? null : num(ch.statistics?.subscriberCount),
    totalViews: num(ch.statistics?.viewCount),
    mediaCount: num(ch.statistics?.videoCount),
    posts,
  };
}

export const youtubeProvider: PublicDataProvider = {
  id: "youtube-data-api",
  platform: "youtube",
  availability: "official",
  needsConnectedAccount: false,
  creditsPerFetch: 0,
  isConfigured: isYouTubeConfigured,
  async lookup(input) {
    const ref = parseYouTubeInput(input);
    if (!ref) throw new ResearchError("youtube", "invalid_input");
    return snapshot(ref);
  },
  refresh(ref) {
    return snapshot({ kind: "id", value: ref.externalId });
  },
};
