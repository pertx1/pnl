import "server-only";
import { jsonOrThrow, platformFetch } from "../http";
import { PlatformError, type PlatformAdapter, type TokenSet } from "../types";

/**
 * TikTok — Login Kit v2 + Display API + Content Posting API (oficiales).
 * Docs: https://developers.tiktok.com/doc/login-kit-web · /doc/oauth-user-access-token-management
 * Sin la auditoría de Direct Post, lo publicado queda PRIVADO (solo lo ve el creador).
 */
const AUTH = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com/v2";

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
  open_id: string;
  error?: string;
};

function creds() {
  return { key: process.env.TIKTOK_CLIENT_KEY ?? "", secret: process.env.TIKTOK_CLIENT_SECRET ?? "" };
}

function toTokens(t: TokenResponse): TokenSet {
  const now = Date.now();
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    accessExpiresAt: new Date(now + t.expires_in * 1000),
    refreshExpiresAt: new Date(now + t.refresh_expires_in * 1000),
    grantedScopes: t.scope.split(",").map((s) => s.trim()).filter(Boolean),
  };
}

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await platformFetch("tiktok", `${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => null)) as (TokenResponse & { error_description?: string; log_id?: string }) | null;
  if (!res.ok || !json || json.error || !json.access_token) {
    // Solo el código y la descripción de TikTok (nunca el código de autorización ni las claves).
    console.error(
      `[oauth] tiktok token: http=${res.status} error=${json?.error ?? "?"} desc=${(json?.error_description ?? "").slice(0, 160)} log_id=${json?.log_id ?? ""}`,
    );
    throw new PlatformError("tiktok", "token_exchange_failed", res.status);
  }
  return toTokens(json);
}

export const tiktok: PlatformAdapter = {
  id: "tiktok",
  scopes: ["user.info.basic", "user.info.profile", "user.info.stats", "video.publish"],
  usesPkce: false,
  isConfigured: () => Boolean(creds().key && creds().secret),

  authorizeUrl({ state, redirectUri }) {
    const p = new URLSearchParams({
      client_key: creds().key,
      scope: this.scopes.join(","),
      response_type: "code",
      redirect_uri: redirectUri,
      state,
    });
    return `${AUTH}?${p}`;
  },

  exchangeCode({ code, redirectUri }) {
    const { key, secret } = creds();
    return tokenRequest({ client_key: key, client_secret: secret, code, grant_type: "authorization_code", redirect_uri: redirectUri });
  },

  refresh(refreshToken) {
    const { key, secret } = creds();
    return tokenRequest({ client_key: key, client_secret: secret, grant_type: "refresh_token", refresh_token: refreshToken });
  },

  async revoke(accessToken) {
    const { key, secret } = creds();
    await platformFetch("tiktok", `${API}/oauth/revoke/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: key, client_secret: secret, token: accessToken }),
    });
  },

  async fetchProfiles(tokens) {
    const fields = "open_id,avatar_url,display_name,username";
    const res = await platformFetch("tiktok", `${API}/user/info/?fields=${fields}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const json = await jsonOrThrow<{ data: { user: { open_id: string; avatar_url?: string; display_name?: string; username?: string } } }>(
      "tiktok",
      res,
      "profile_failed",
    );
    const u = json.data.user;
    return [{ externalId: u.open_id, handle: u.username ?? null, displayName: u.display_name ?? null, avatarUrl: u.avatar_url ?? null }];
  },

  async fetchStats(tokens) {
    const fields = "follower_count,likes_count,video_count";
    const res = await platformFetch("tiktok", `${API}/user/info/?fields=${fields}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const json = await jsonOrThrow<{ data: { user: { follower_count?: number; likes_count?: number; video_count?: number } } }>(
      "tiktok",
      res,
      "stats_failed",
    );
    const u = json.data.user;
    return { followers: u.follower_count, likes: u.likes_count, posts: u.video_count };
  },
};
