import "server-only";
import { jsonOrThrow, platformFetch } from "../http";
import { PlatformError, type ConnectedProfile, type PlatformAdapter, type TokenSet } from "../types";

/**
 * Instagram (cuentas business/creator) — Instagram API con Facebook Login (oficial).
 * Usamos esta variante porque Business Discovery (competencia, Fase 2) solo está disponible aquí.
 * Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login
 */
const version = () => process.env.META_GRAPH_VERSION ?? "v27.0"; // verificar la versión vigente al configurar la app
const GRAPH = () => `https://graph.facebook.com/${version()}`;

function creds() {
  return { id: process.env.META_APP_ID ?? "", secret: process.env.META_APP_SECRET ?? "" };
}

async function grantedScopes(token: string): Promise<string[]> {
  const res = await platformFetch("instagram", `${GRAPH()}/me/permissions?access_token=${encodeURIComponent(token)}`);
  const json = await jsonOrThrow<{ data: { permission: string; status: string }[] }>("instagram", res, "permissions_failed");
  return json.data.filter((p) => p.status === "granted").map((p) => p.permission);
}

/** Token de usuario de larga duración (~60 días). Meta no da refresh token: se renueva re-intercambiando. */
async function longLived(shortToken: string): Promise<TokenSet> {
  const { id, secret } = creds();
  const p = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: shortToken });
  const res = await platformFetch("instagram", `${GRAPH()}/oauth/access_token?${p}`);
  const json = await jsonOrThrow<{ access_token: string; expires_in?: number }>("instagram", res, "token_exchange_failed");
  return {
    accessToken: json.access_token,
    accessExpiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
    grantedScopes: await grantedScopes(json.access_token),
  };
}

export const instagram: PlatformAdapter = {
  id: "instagram",
  scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement", "business_management"],
  usesPkce: false,
  isConfigured: () => Boolean(creds().id && creds().secret),

  authorizeUrl({ state, redirectUri }) {
    const p = new URLSearchParams({ client_id: creds().id, redirect_uri: redirectUri, state, response_type: "code" });
    // Apps de tipo Empresa (Facebook Login for Business): los permisos van en una "configuración" (config_id).
    // Sin configuración, se piden por scope (Facebook Login clásico).
    const configId = process.env.META_LOGIN_CONFIG_ID;
    if (configId) p.set("config_id", configId);
    else p.set("scope", this.scopes.join(","));
    return `https://www.facebook.com/${version()}/dialog/oauth?${p}`;
  },

  async exchangeCode({ code, redirectUri }) {
    const { id, secret } = creds();
    const p = new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: redirectUri, code });
    const res = await platformFetch("instagram", `${GRAPH()}/oauth/access_token?${p}`);
    const json = await jsonOrThrow<{ access_token: string }>("instagram", res, "token_exchange_failed");
    return longLived(json.access_token);
  },

  refresh(token) {
    // En Meta "refrescar" = volver a intercambiar un token de larga duración aún válido.
    return longLived(token);
  },

  async revoke(accessToken) {
    await platformFetch("instagram", `${GRAPH()}/me/permissions?access_token=${encodeURIComponent(accessToken)}`, { method: "DELETE" });
  },

  async fetchProfiles(tokens) {
    const fields = "id,name,instagram_business_account{id,username,name,profile_picture_url}";
    const res = await platformFetch("instagram", `${GRAPH()}/me/accounts?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(tokens.accessToken)}`);
    const json = await jsonOrThrow<{
      data: { id: string; name: string; instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string } }[];
    }>("instagram", res, "profile_failed");
    const profiles: ConnectedProfile[] = json.data
      .filter((p) => p.instagram_business_account)
      .map((p) => ({
        externalId: p.instagram_business_account!.id,
        handle: p.instagram_business_account!.username ?? null,
        displayName: p.instagram_business_account!.name ?? p.name,
        avatarUrl: p.instagram_business_account!.profile_picture_url ?? null,
        metadata: { page_id: p.id },
      }));
    if (!profiles.length) throw new PlatformError("instagram", "no_business_account");
    return profiles;
  },

  async fetchStats(tokens, profile) {
    const fields = "followers_count,media_count";
    const res = await platformFetch("instagram", `${GRAPH()}/${profile.externalId}?fields=${fields}&access_token=${encodeURIComponent(tokens.accessToken)}`);
    const json = await jsonOrThrow<{ followers_count?: number; media_count?: number }>("instagram", res, "stats_failed");
    return { followers: json.followers_count, posts: json.media_count };
  },
};
