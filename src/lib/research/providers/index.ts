import "server-only";
import { instagramProvider } from "./instagram";
import { tiktokNoneProvider } from "./none";
import type { CompetitorPlatform, PublicDataProvider } from "./types";
import { youtubeProvider } from "./youtube";

export const PROVIDERS: Record<CompetitorPlatform, PublicDataProvider> = {
  youtube: youtubeProvider,
  instagram: instagramProvider,
  tiktok: tiktokNoneProvider,
};

export function getProvider(platform: CompetitorPlatform): PublicDataProvider {
  return PROVIDERS[platform];
}

export type { CompetitorPlatform, PostSnapshot, ProfileSnapshot, PublicDataProvider } from "./types";
