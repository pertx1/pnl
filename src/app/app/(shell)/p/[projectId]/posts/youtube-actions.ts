"use server";

import { z } from "zod";
import { getAdapter } from "@/lib/social";
import { listYouTubePlaylists } from "@/lib/social/publish";
import { loadTokens, saveTokens } from "@/lib/social/token-store";
import { createClient } from "@/lib/supabase/server";

export type PlaylistsResult = { ok: true; playlists: { id: string; title: string }[] } | { ok?: false; error: "forbidden" | "reconnect" | "generic" };

/** Listas de reproducción del canal de YouTube conectado (para elegir una en el editor). Solo lectura. */
export async function getYouTubePlaylists(projectId: string, socialAccountId: string): Promise<PlaylistsResult> {
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(socialAccountId).success) return { error: "forbidden" };
  // RLS: solo miembros del workspace ven la cuenta; además debe ser de este proyecto y de YouTube.
  const supabase = await createClient();
  const { data: acc } = await supabase.from("social_accounts").select("id, platform, status").eq("id", socialAccountId).eq("project_id", projectId).maybeSingle();
  if (!acc || acc.platform !== "youtube") return { error: "forbidden" };
  if (acc.status !== "active") return { error: "reconnect" };

  let tokens = await loadTokens(acc.id);
  if (!tokens) return { error: "reconnect" };
  try {
    if (tokens.accessExpiresAt && tokens.accessExpiresAt.getTime() < Date.now() + 60_000) {
      const refreshed = await getAdapter("youtube")!.refresh(tokens.refreshToken ?? tokens.accessToken);
      tokens = { ...refreshed, refreshToken: refreshed.refreshToken ?? tokens.refreshToken };
      await saveTokens(acc.id, tokens);
    }
    return { ok: true, playlists: await listYouTubePlaylists(tokens) };
  } catch {
    return { error: "generic" };
  }
}
