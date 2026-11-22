import "server-only";
import { jsonOrThrow, platformFetch } from "../http";
import { PlatformError, type PlatformAdapter, type TokenSet } from "../types";

/**
 * YouTube — Google OAuth 2.0 + YouTube Data API v3 + YouTube Analytics API (oficiales).
 * Cumplimiento: YouTube API Services Terms (datos autorizados del propio canal; borrar al revocar),
 * mostrar la marca de YouTube y enlazar a la política de privacidad de Google.
 */
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  // Añadir el vídeo a una lista de reproducción (playlistItems.insert) exige youtube.force-ssl:
  // youtube.upload solo permite subir y poner miniatura.
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

function creds() {
  return { id: process.env.GOOGLE_CLIENT_ID ?? "", secret: process.env.GOOGLE_CLIENT_SECRET ?? "" };
}

type GoogleToken = { access_token: string; expires_in: number; refresh_token?: string; scope: string; error?: string };

async function tokenRequest(body: Record<string, string>, keepRefresh?: string): Promise<TokenSet> {
  const res = await platformFetch("youtube", "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = await jsonOrThrow<GoogleToken>("youtube", res, "token_exchange_failed");
  if (json.error) throw new PlatformError("youtube", "token_exchange_failed", res.status);
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? keepRefresh,
    accessExpiresAt: new Date(Date.now() + json.expires_in * 1000),
    grantedScopes: json.scope.split(" ").filter(Boolean),
  };
}

export const youtube: PlatformAdapter = {
  id: "youtube",
  scopes: SCOPES,
  usesPkce: true,
  isConfigured: () => Boolean(creds().id && creds().secret),

  authorizeUrl({ state, redirectUri, codeChallenge }) {
    const p = new URLSearchParams({
      client_id: creds().id,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
      code_challenge: codeChallenge ?? "",
      code_challenge_method: "S256",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  },

  exchangeCode({ code, redirectUri, codeVerifier }) {
    const { id, secret } = creds();
    return tokenRequest({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier ?? "",
    });
  },

  refresh(refreshToken) {
    const { id, secret } = creds();
    return tokenRequest({ client_id: id, client_secret: secret, refresh_token: refreshToken, grant_type: "refresh_token" }, refreshToken);
  },

  async revoke(accessToken) {
    await platformFetch("youtube", `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },

  async fetchProfiles(tokens) {
    const res = await platformFetch("youtube", "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const json = await jsonOrThrow<{
      items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } } }[];
    }>("youtube", res, "profile_failed");
    if (!json.items?.length) throw new PlatformError("youtube", "no_channel");
    return json.items.map((c) => ({
      externalId: c.id,
      handle: c.snippet.customUrl ?? null,
      displayName: c.snippet.title,
      avatarUrl: c.snippet.thumbnails?.default?.url ?? null,
    }));
  },

  async fetchStats(tokens, profile) {
    const res = await platformFetch("youtube", `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(profile.externalId)}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const json = await jsonOrThrow<{ items?: { statistics: { subscriberCount?: string; viewCount?: string; videoCount?: string } }[] }>(
      "youtube",
      res,
      "stats_failed",
    );
    const s = json.items?.[0]?.statistics;
    return { followers: s?.subscriberCount ? Number(s.subscriberCount) : undefined, views: s?.viewCount ? Number(s.viewCount) : undefined, posts: s?.videoCount ? Number(s.videoCount) : undefined };
  },
};
