import "server-only";
import { createClient } from "@/lib/supabase/server";

export type EditorAccount = { id: string; platform: string; handle: string | null; display_name: string | null; status: string };
export type EditorAsset = { id: string; url: string | null; mime: string; ai: boolean };

/**
 * Cuentas y biblioteca de medios (con URLs firmadas de 1 h) de un proyecto.
 * `ensureAssetIds`: medios que deben estar aunque no sean de los 60 más recientes (p. ej. «Usar en una publicación»).
 */
export async function getEditorData(projectId: string, ensureAssetIds: string[] = []) {
  const supabase = await createClient();
  const cols = "id, storage_path, mime_type, ai_generated";
  const [{ data: accounts }, { data: recent }, { data: extra }] = await Promise.all([
    supabase.from("social_accounts").select("id, platform, handle, display_name, status").eq("project_id", projectId).order("created_at"),
    supabase.from("assets").select(cols).eq("project_id", projectId).order("created_at", { ascending: false }).limit(60),
    ensureAssetIds.length ? supabase.from("assets").select(cols).eq("project_id", projectId).in("id", ensureAssetIds) : Promise.resolve({ data: [] as never[] }),
  ]);
  const assets = [...(extra ?? []).filter((e) => !(recent ?? []).some((r) => r.id === e.id)), ...(recent ?? [])];
  const paths = assets.map((a) => a.storage_path);
  const { data: signed } = paths.length ? await supabase.storage.from("project-media").createSignedUrls(paths, 3600) : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return {
    accounts: (accounts ?? []) as EditorAccount[],
    assets: assets.map((a) => ({ id: a.id, url: urlByPath.get(a.storage_path) ?? null, mime: a.mime_type, ai: a.ai_generated })) as EditorAsset[],
  };
}
