import "server-only";
import { instagram } from "./platforms/instagram";
import { tiktok } from "./platforms/tiktok";
import { youtube } from "./platforms/youtube";
import { PLATFORMS, type Platform, type PlatformAdapter } from "./types";

export const adapters: Record<Platform, PlatformAdapter> = { tiktok, instagram, youtube };

export function getAdapter(p: string): PlatformAdapter | null {
  return (PLATFORMS as string[]).includes(p) ? adapters[p as Platform] : null;
}

export function missingScopes(adapter: PlatformAdapter, granted: string[]) {
  return adapter.scopes.filter((s) => !granted.includes(s));
}
