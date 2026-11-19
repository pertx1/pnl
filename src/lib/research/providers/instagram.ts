import "server-only";
import { createHmac } from "node:crypto";
import { graphVersion } from "../config";
import { researchJson, ResearchError } from "../http";
import { parseInstagramInput } from "../parse";
import type { ProfileSnapshot, ProviderContext, PublicDataProvider } from "./types";

/**
 * Instagram Business Discovery (Instagram API con Facebook Login, oficial). Usa el token de una cuenta business/creator
 * CONECTADA en el proyecto para leer datos públicos de OTRA cuenta business/creator. Solo funciona con cuentas profesionales.
 * Permisos: instagram_basic + pages_read_engagement (ya pedidos al conectar). No pedimos media_url: no copiamos contenido.
 * Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery
 */
type Discovery = {
  business_discovery?: {
    id: string;
    username: string;
    name?: string;
    profile_picture_url?: string;
    followers_count?: number;
    media_count?: number;
    media?: { data: { id: string; caption?: string; like_count?: number; comments_count?: number; timestamp?: string; permalink?: string; media_type?: string }[] };
  };
};

async function discover(username: string, ctx: ProviderContext): Promise<ProfileSnapshot> {
  if (!ctx.igUserId || !ctx.accessToken) throw new ResearchError("instagram", "needs_connected_account");
  const fields = `business_discovery.username(${username}){id,username,name,profile_picture_url,followers_count,media_count,media.limit(30){id,caption,like_count,comments_count,timestamp,permalink,media_type}}`;
  const p = new URLSearchParams({ fields });
  // Token en cabecera (no en la URL) + appsecret_proof si hay secreto de app.
  const secret = process.env.META_APP_SECRET;
  if (secret) p.set("appsecret_proof", createHmac("sha256", secret).update(ctx.accessToken).digest("hex"));
  const json = await researchJson<Discovery>("instagram", `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(ctx.igUserId)}?${p}`, {
    headers: { Authorization: `Bearer ${ctx.accessToken}` },
  }).catch((e) => {
    // Cuenta inexistente o personal (no business/creator) → Graph devuelve 400 con code 110/100.
    if (e instanceof ResearchError && e.code === "bad_response") throw new ResearchError("instagram", "not_found_or_personal", e.status);
    throw e;
  });
  const b = json.business_discovery;
  if (!b) throw new ResearchError("instagram", "not_found_or_personal");
  return {
    externalId: b.id,
    handle: b.username,
    displayName: b.name ?? null,
    avatarUrl: b.profile_picture_url ?? null,
    profileUrl: `https://www.instagram.com/${b.username}/`,
    followers: b.followers_count ?? null,
    totalViews: null,
    mediaCount: b.media_count ?? null,
    posts: (b.media?.data ?? []).map((m) => ({
      externalId: m.id,
      title: m.caption ? m.caption.slice(0, 1000) : null,
      url: m.permalink ?? null,
      thumbnailUrl: null,
      mediaType: m.media_type?.toLowerCase() ?? null,
      publishedAt: m.timestamp ?? null,
      views: null, // Business Discovery no da reproducciones de cuentas ajenas
      likes: m.like_count ?? null, // null si el autor oculta los likes
      comments: m.comments_count ?? null,
    })),
  };
}

export const instagramProvider: PublicDataProvider = {
  id: "instagram-business-discovery",
  platform: "instagram",
  availability: "official",
  needsConnectedAccount: true,
  creditsPerFetch: 0,
  isConfigured: () => true,
  async lookup(input, ctx) {
    const username = parseInstagramInput(input);
    if (!username) throw new ResearchError("instagram", "invalid_input");
    return discover(username, ctx);
  },
  async refresh(ref, ctx) {
    if (!ref.handle) throw new ResearchError("instagram", "invalid_input");
    return discover(ref.handle, ctx);
  },
};
