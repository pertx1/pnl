import "server-only";
import { jsonOrThrow, platformFetch } from "../http";
import {
  buildIgAuthorizeUrl,
  cleanIgCode,
  IG_LOGIN_MARK,
  IG_LOGIN_SCOPES,
  IG_PUBLISH_SCOPES,
  IG_TOKEN_URL,
  igGraph,
  instagramLoginEnabled,
  isInstagramLogin,
  parseIgShortToken,
} from "../instagram-login";
import { PlatformError, type ConnectedProfile, type PlatformAdapter, type TokenSet } from "../types";

/**
 * Instagram (cuentas profesionales: business/creator). Dos variantes OFICIALES:
 *  1) Por defecto, si hay INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET: **Instagram API with Instagram Login**
 *     (Business Login for Instagram, host graph.instagram.com). Sin página de Facebook.
 *     https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 *  2) Alternativa (sin esas variables): Instagram API con Facebook Login for Business (config_id, graph.facebook.com).
 *     Las cuentas ya conectadas así siguen funcionando hasta que se reconecten.
 *     https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login
 * La variante de cada cuenta se guarda en `social_accounts.metadata.login` ("instagram") o por `page_id` (Facebook).
 */
const version = () => process.env.META_GRAPH_VERSION ?? "v27.0"; // verificar la versión vigente al configurar la app
const FB_GRAPH = () => `https://graph.facebook.com/${version()}`;
const FB_SCOPES = ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement", "business_management"];

function fbCreds() {
  return { id: process.env.META_APP_ID ?? "", secret: process.env.META_APP_SECRET ?? "" };
}
function igCreds() {
  return { id: process.env.INSTAGRAM_APP_ID ?? "", secret: process.env.INSTAGRAM_APP_SECRET ?? "" };
}
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// ------------------------------------------------------------------------------- Instagram Login (graph.instagram.com)

/** Token corto (1 h) → token largo (60 días). La doc lo documenta como GET con `access_token` y `client_secret`. */
async function igLongLived(shortToken: string): Promise<{ accessToken: string; accessExpiresAt?: Date }> {
  const p = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: igCreds().secret, access_token: shortToken });
  const res = await platformFetch("instagram", `https://graph.instagram.com/access_token?${p}`);
  const json = await jsonOrThrow<{ access_token: string; expires_in?: number }>("instagram", res, "token_exchange_failed");
  return { accessToken: json.access_token, accessExpiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined };
}

/** Intercambio del code de Instagram Login. Exportado para la Bandeja (misma app, otra URL de redirección). */
export async function igLoginExchange(code: string, redirectUri: string): Promise<TokenSet> {
  const { id, secret } = igCreds();
  const body = new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "authorization_code", redirect_uri: redirectUri, code: cleanIgCode(code) });
  // Un único intento: el code es de un solo uso.
  const res = await platformFetch("instagram", IG_TOKEN_URL, { method: "POST", body }, 1);
  const short = parseIgShortToken(await jsonOrThrow<unknown>("instagram", res, "token_exchange_failed"));
  if (!short) throw new PlatformError("instagram", "token_exchange_failed");
  const long = await igLongLived(short.accessToken);
  return { ...long, grantedScopes: short.permissions };
}

/** Refresco del token largo (≥ 24 h de antigüedad y sin caducar). Devuelve otro token válido 60 días. */
export async function igLoginRefresh(token: string): Promise<TokenSet> {
  const p = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token });
  const res = await platformFetch("instagram", `https://graph.instagram.com/refresh_access_token?${p}`);
  const json = await jsonOrThrow<{ access_token: string; expires_in?: number }>("instagram", res, "refresh_failed");
  return {
    accessToken: json.access_token,
    accessExpiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
    grantedScopes: [],
  };
}

type IgMe = { user_id?: string | number; username?: string; name?: string; profile_picture_url?: string; account_type?: string };

/** Perfil de la cuenta profesional. `user_id` = id de la cuenta profesional (el mismo que llega en `entry.id` del webhook). */
export async function igLoginMe(token: string): Promise<ConnectedProfile> {
  const fields = "user_id,username,name,profile_picture_url,account_type";
  const res = await platformFetch("instagram", `${igGraph(version())}/me?fields=${fields}`, { headers: bearer(token) });
  const me = await jsonOrThrow<IgMe>("instagram", res, "profile_failed");
  if (me.user_id === undefined || me.user_id === null || me.user_id === "") throw new PlatformError("instagram", "no_business_account");
  return {
    externalId: String(me.user_id),
    handle: me.username ?? null,
    displayName: me.name || me.username || null,
    avatarUrl: me.profile_picture_url ?? null,
    metadata: { login: IG_LOGIN_MARK, ...(me.account_type ? { account_type: String(me.account_type).slice(0, 40) } : {}) },
  };
}

// ------------------------------------------------------------------------------- Facebook Login for Business (antiguo)

async function fbGrantedScopes(token: string): Promise<string[]> {
  const res = await platformFetch("instagram", `${FB_GRAPH()}/me/permissions?access_token=${encodeURIComponent(token)}`);
  const json = await jsonOrThrow<{ data: { permission: string; status: string }[] }>("instagram", res, "permissions_failed");
  return json.data.filter((p) => p.status === "granted").map((p) => p.permission);
}

/** Token de usuario de larga duración (~60 días). Meta no da refresh token: se renueva re-intercambiando. */
async function fbLongLived(shortToken: string): Promise<TokenSet> {
  const { id, secret } = fbCreds();
  const p = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: shortToken });
  const res = await platformFetch("instagram", `${FB_GRAPH()}/oauth/access_token?${p}`);
  const json = await jsonOrThrow<{ access_token: string; expires_in?: number }>("instagram", res, "token_exchange_failed");
  return {
    accessToken: json.access_token,
    accessExpiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
    grantedScopes: await fbGrantedScopes(json.access_token),
  };
}

// ------------------------------------------------------------------------------- Adapter

export const instagram: PlatformAdapter = {
  id: "instagram",
  /** Permisos que deben estar concedidos para publicar (los que se piden dependen de la variante). */
  get scopes() {
    return instagramLoginEnabled() ? IG_PUBLISH_SCOPES : FB_SCOPES;
  },
  usesPkce: false,
  isConfigured: () => instagramLoginEnabled() || Boolean(fbCreds().id && fbCreds().secret),

  authorizeUrl({ state, redirectUri }) {
    if (instagramLoginEnabled()) {
      // Publicar + mensajes de una vez (la Bandeja reutiliza este token con «Activar mensajes»).
      return buildIgAuthorizeUrl({ clientId: igCreds().id, redirectUri, state, scopes: IG_LOGIN_SCOPES });
    }
    const p = new URLSearchParams({ client_id: fbCreds().id, redirect_uri: redirectUri, state, response_type: "code" });
    // Apps de tipo Empresa (Facebook Login for Business): los permisos van en una "configuración" (config_id).
    const configId = process.env.META_LOGIN_CONFIG_ID;
    if (configId) p.set("config_id", configId);
    else p.set("scope", FB_SCOPES.join(","));
    return `https://www.facebook.com/${version()}/dialog/oauth?${p}`;
  },

  async exchangeCode({ code, redirectUri }) {
    if (instagramLoginEnabled()) return igLoginExchange(code, redirectUri);
    const { id, secret } = fbCreds();
    const p = new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: redirectUri, code });
    const res = await platformFetch("instagram", `${FB_GRAPH()}/oauth/access_token?${p}`);
    const json = await jsonOrThrow<{ access_token: string }>("instagram", res, "token_exchange_failed");
    return fbLongLived(json.access_token);
  },

  refresh(token, ctx) {
    if (isInstagramLogin(ctx?.metadata)) return igLoginRefresh(token);
    // En Facebook Login "refrescar" = volver a intercambiar un token de larga duración aún válido.
    return fbLongLived(token);
  },

  async revoke(accessToken, ctx) {
    // Instagram Login no documenta un endpoint para revocar el token: Kreo lo borra y la persona puede quitar la app en
    // Instagram → Configuración → Apps y sitios web. Meta avisa con el callback de desautorización.
    if (isInstagramLogin(ctx?.metadata)) return;
    await platformFetch("instagram", `${FB_GRAPH()}/me/permissions?access_token=${encodeURIComponent(accessToken)}`, { method: "DELETE" });
  },

  async fetchProfiles(tokens) {
    if (instagramLoginEnabled()) return [await igLoginMe(tokens.accessToken)];
    const fields = "id,name,instagram_business_account{id,username,name,profile_picture_url}";
    const res = await platformFetch("instagram", `${FB_GRAPH()}/me/accounts?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(tokens.accessToken)}`);
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
    if (isInstagramLogin(profile.metadata)) {
      const res = await platformFetch("instagram", `${igGraph(version())}/me?fields=${fields}`, { headers: bearer(tokens.accessToken) });
      const json = await jsonOrThrow<{ followers_count?: number; media_count?: number }>("instagram", res, "stats_failed");
      return { followers: json.followers_count, posts: json.media_count };
    }
    const res = await platformFetch("instagram", `${FB_GRAPH()}/${profile.externalId}?fields=${fields}&access_token=${encodeURIComponent(tokens.accessToken)}`);
    const json = await jsonOrThrow<{ followers_count?: number; media_count?: number }>("instagram", res, "stats_failed");
    return { followers: json.followers_count, posts: json.media_count };
  },
};
