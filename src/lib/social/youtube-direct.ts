import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { platformFetch } from "./http";
import type { PublishMedia } from "./publish";
import type { TokenSet } from "./types";
import { youtubeErrorKey } from "./youtube-upload-core";

/**
 * Subida directa navegador → YouTube (parte de servidor). El ACCESS TOKEN nunca sale de aquí: el servidor abre la
 * sesión reanudable de videos.insert y al navegador solo le llega la URL de esa sesión (sirve únicamente para subir
 * los bytes de ESE vídeo, con los metadatos ya fijados por el servidor).
 */

export class YouTubeDirectError extends Error {
  constructor(
    public key: string,
    public status?: number,
  ) {
    super(key);
  }
}

/**
 * Abre la sesión reanudable. La cabecera `Origin` con el dominio de la app hace que el servidor de subidas de Google
 * responda con CORS a los PUT del navegador sobre la URL de sesión (mismo criterio que documenta Google Cloud Storage:
 * «include an Origin header in both this and subsequent upload requests»). Node permite fijar `Origin` en fetch.
 */
export async function startYouTubeResumableSession(
  tokens: TokenSet,
  opts: { url: string; resource: unknown; size: number; mime: string; origin: string },
): Promise<string> {
  const res = await platformFetch("youtube", opts.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(opts.size),
      "X-Upload-Content-Type": opts.mime,
      Origin: opts.origin,
    },
    body: JSON.stringify(opts.resource),
  });
  const location = res.headers.get("location");
  if (!res.ok || !location) {
    const body = await res.json().catch(() => null);
    throw new YouTubeDirectError(youtubeErrorKey(res.status, body), res.status);
  }
  // Defensa: la URL de sesión debe ser del servidor de subidas de Google.
  const u = new URL(location);
  if (u.protocol !== "https:" || !u.hostname.endsWith(".googleapis.com") || !u.pathname.startsWith("/upload/")) {
    throw new YouTubeDirectError("generic");
  }
  return location;
}

export type UploadedVideo = { id: string; channelId: string; privacyStatus?: string; publishAt?: string; uploadStatus?: string; rejectionReason?: string; failureReason?: string };

/** Comprueba con videos.list (token de la cuenta) que el vídeo existe. `null` si no existe o no es visible para el canal. */
export async function getUploadedVideo(tokens: TokenSet, videoId: string): Promise<UploadedVideo | null> {
  const res = await platformFetch("youtube", `https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${encodeURIComponent(videoId)}`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  });
  const body = (await res.json().catch(() => null)) as {
    items?: { id: string; snippet?: { channelId?: string }; status?: { privacyStatus?: string; publishAt?: string; uploadStatus?: string; rejectionReason?: string; failureReason?: string } }[];
  } | null;
  if (!res.ok) throw new YouTubeDirectError(youtubeErrorKey(res.status, body), res.status);
  const v = body?.items?.[0];
  if (!v?.snippet?.channelId) return null;
  return { id: v.id, channelId: v.snippet.channelId, ...v.status };
}

/** Miniatura de YouTube: solo una imagen JPG/PNG del MISMO proyecto que la publicación (worker y subida directa). */
export async function loadYouTubeThumbnail(db: SupabaseClient<Database>, assetId: string, projectId: string): Promise<PublishMedia | undefined> {
  const { data: th } = await db.from("assets").select("storage_path, mime_type, project_id").eq("id", assetId).maybeSingle();
  if (!th || th.project_id !== projectId || !/^image\/(jpeg|png)$/.test(th.mime_type)) return undefined;
  const { data: signed } = await db.storage.from("project-media").createSignedUrl(th.storage_path, 60 * 60);
  if (!signed?.signedUrl) return undefined;
  const url = signed.signedUrl;
  return { url, mime: th.mime_type, bytes: async () => (await fetch(url)).arrayBuffer() };
}
