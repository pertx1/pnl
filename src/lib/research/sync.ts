import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTokens } from "@/lib/social/token-store";
import type { Database } from "@/lib/supabase/database.types";
import { youtubeDerivedAllowed } from "./config";
import { errorCode, ResearchError } from "./http";
import { findOutliers, performanceValue } from "./metrics";
import { getProvider, type CompetitorPlatform, type ProfileSnapshot } from "./providers";
import type { ProviderContext } from "./providers/types";

type Db = SupabaseClient<Database>;
type CompetitorRow = Database["public"]["Tables"]["research_competitors"]["Row"];

/** ¿Se pueden calcular métricas derivadas (outliers, frecuencia) para esta red? Ver config.youtubeDerivedAllowed. */
export function derivedAllowed(platform: string) {
  return platform !== "youtube" || youtubeDerivedAllowed();
}

/** Contexto de Instagram: id de la cuenta business conectada + su token (descifrado solo en memoria). */
export async function instagramContext(db: Db, socialAccountId: string | null): Promise<ProviderContext> {
  if (!socialAccountId) throw new ResearchError("instagram", "needs_connected_account");
  const { data: acc } = await db.from("social_accounts").select("id, external_id, status, platform").eq("id", socialAccountId).maybeSingle();
  if (!acc || acc.platform !== "instagram" || acc.status !== "active") throw new ResearchError("instagram", "needs_connected_account");
  const tokens = await loadTokens(acc.id);
  if (!tokens) throw new ResearchError("instagram", "needs_connected_account");
  if (tokens.accessExpiresAt && tokens.accessExpiresAt.getTime() < Date.now()) throw new ResearchError("instagram", "token_invalid");
  return { igUserId: acc.external_id, accessToken: tokens.accessToken };
}

/** Elige la primera cuenta de Instagram activa del proyecto (para Business Discovery). */
export async function pickInstagramAccount(db: Db, projectId: string): Promise<string | null> {
  const { data } = await db
    .from("social_accounts")
    .select("id")
    .eq("project_id", projectId)
    .eq("platform", "instagram")
    .eq("status", "active")
    .order("created_at")
    .limit(1);
  return data?.[0]?.id ?? null;
}

/**
 * Guarda el snapshot: estadísticas del perfil + publicaciones (las que ya no vienen se borran: minimización)
 * y, si no es la primera sincronización, crea alertas para outliers NUEVOS de los últimos 30 días.
 */
export async function writeSnapshot(db: Db, competitor: Pick<CompetitorRow, "id" | "workspace_id" | "project_id" | "platform" | "last_fetched_at">, snap: ProfileSnapshot) {
  const now = new Date().toISOString();
  const { error } = await db
    .from("research_competitors")
    .update({
      handle: snap.handle,
      display_name: snap.displayName,
      avatar_url: snap.avatarUrl,
      profile_url: snap.profileUrl,
      followers: snap.followers,
      total_views: snap.totalViews,
      media_count: snap.mediaCount,
      last_fetched_at: now,
      fetch_error: null,
    })
    .eq("id", competitor.id);
  if (error) throw error;

  if (snap.posts.length) {
    const { error: e2 } = await db.from("research_competitor_posts").upsert(
      snap.posts.map((p) => ({
        competitor_id: competitor.id,
        workspace_id: competitor.workspace_id,
        external_id: p.externalId,
        title: p.title,
        url: p.url,
        thumbnail_url: p.thumbnailUrl,
        media_type: p.mediaType,
        published_at: p.publishedAt,
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        fetched_at: now,
      })),
      { onConflict: "competitor_id,external_id" },
    );
    if (e2) throw e2;
  }
  // Publicaciones que ya no devuelve la API (borradas, privadas o fuera de la ventana) → fuera.
  await db.from("research_competitor_posts").delete().eq("competitor_id", competitor.id).lt("fetched_at", now);

  let newAlerts = 0;
  if (competitor.last_fetched_at && derivedAllowed(competitor.platform)) {
    const { data: posts } = await db
      .from("research_competitor_posts")
      .select("id, published_at, views, likes, comments")
      .eq("competitor_id", competitor.id)
      .order("published_at", { ascending: false })
      .limit(50);
    const { outliers } = findOutliers((posts ?? []).map((p) => ({ id: p.id, publishedAt: p.published_at, value: performanceValue(p) })));
    const recent = outliers.filter((o) => o.post.publishedAt && Date.now() - Date.parse(o.post.publishedAt) < 30 * 86_400_000);
    if (recent.length) {
      const { data: inserted } = await db
        .from("research_alerts")
        .upsert(
          recent.map((o) => ({ workspace_id: competitor.workspace_id, project_id: competitor.project_id, competitor_id: competitor.id, post_id: o.post.id, multiple: o.multiple })),
          { onConflict: "post_id", ignoreDuplicates: true },
        )
        .select("id");
      newAlerts = inserted?.length ?? 0;
    }
  }
  return { posts: snap.posts.length, newAlerts };
}

/** Refresca un competidor ya seguido. Guarda un código de error (nunca el mensaje de la API) si falla. */
export async function refreshCompetitor(db: Db, competitor: CompetitorRow): Promise<{ ok: true; newAlerts: number } | { ok: false; code: string }> {
  const platform = competitor.platform as CompetitorPlatform;
  const provider = getProvider(platform);
  try {
    if (provider.availability !== "official") throw new ResearchError(platform, "coming_soon");
    const ctx = platform === "instagram" ? await instagramContext(db, competitor.via_social_account_id) : {};
    const snap = await provider.refresh({ externalId: competitor.external_id, handle: competitor.handle }, ctx);
    const r = await writeSnapshot(db, competitor, snap);
    return { ok: true, newAlerts: r.newAlerts };
  } catch (e) {
    const code = errorCode(e);
    await db.from("research_competitors").update({ fetch_error: code }).eq("id", competitor.id);
    return { ok: false, code };
  }
}
