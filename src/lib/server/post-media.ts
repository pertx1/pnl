import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Portada de una publicación para mostrarla como miniatura (URL firmada de 1 h, como en el editor). */
export type PostCover = { url: string; kind: "image" | "video"; poster: string | null };

export type CoverSource = {
  id: string;
  asset_ids?: string[] | null;
  post_targets?: { platform_options?: unknown }[] | null;
};

const CHUNK = 150;

/** Miniatura de YouTube elegida en el editor (si la hay): mejor póster que el primer fotograma. */
function ytThumbnailId(p: CoverSource): string | null {
  for (const t of p.post_targets ?? []) {
    const o = t.platform_options;
    if (o && typeof o === "object" && "yt_thumbnail_asset_id" in o) {
      const v = (o as { yt_thumbnail_asset_id?: unknown }).yt_thumbnail_asset_id;
      if (typeof v === "string" && v) return v;
    }
  }
  return null;
}

/**
 * Portadas de varias publicaciones sin N+1: una consulta de assets (por lotes de ids) y UNA firma por lotes
 * (`createSignedUrls`), igual que `getEditorData`. Con RLS (cliente del usuario). Solo lectura.
 * Portada = primer medio de la publicación; si es vídeo, el póster es la miniatura de YouTube si existe.
 */
export async function getPostCovers(supabase: Db, posts: CoverSource[]): Promise<Map<string, PostCover>> {
  const out = new Map<string, PostCover>();
  const firstOf = new Map<string, string>();
  const posterOf = new Map<string, string>();
  for (const p of posts) {
    const first = p.asset_ids?.[0];
    if (first) firstOf.set(p.id, first);
    const th = ytThumbnailId(p);
    if (th) posterOf.set(p.id, th);
  }
  const ids = [...new Set([...firstOf.values(), ...posterOf.values()])];
  if (ids.length === 0) return out;

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const results = await Promise.all(chunks.map((c) => supabase.from("assets").select("id, storage_path, mime_type").in("id", c)));
  const assets = results.flatMap((r) => r.data ?? []);
  if (assets.length === 0) return out;

  const { data: signed } = await supabase.storage.from("project-media").createSignedUrls(
    assets.map((a) => a.storage_path),
    3600,
  );
  const urlByPath = new Map((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
  const byId = new Map(assets.map((a) => [a.id, { url: urlByPath.get(a.storage_path) ?? null, mime: a.mime_type }]));

  for (const [postId, assetId] of firstOf) {
    const a = byId.get(assetId);
    if (!a?.url) continue;
    const kind = a.mime.startsWith("video/") ? "video" : a.mime.startsWith("image/") ? "image" : null;
    if (!kind) continue;
    const posterId = posterOf.get(postId);
    const poster = posterId ? (byId.get(posterId)?.url ?? null) : null;
    out.set(postId, { url: a.url, kind, poster });
  }
  return out;
}
