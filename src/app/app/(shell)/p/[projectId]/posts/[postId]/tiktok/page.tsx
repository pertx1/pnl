import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { extractHashtags, type PlatformOptions } from "@/lib/posts/rules";
import { getProject, roleAtLeast } from "@/lib/server/dal";
import { AWAITING_USER_PUBLISH, disclosureLabel, parseHandoff } from "@/lib/social/tiktok-core";
import { createClient } from "@/lib/supabase/server";
import { TikTokHandoffCard, type HandoffView } from "./tiktok-handoff";

export async function generateMetadata() {
  const t = await getTranslations("tiktok.handoff");
  return { title: t("title") };
}

/**
 * «Terminar en TikTok»: destinos de TikTok que Kreo envió a los borradores del creador o dejó listos para subir a
 * mano. Muestra los pasos, el vídeo (URL firmada de 1 h para descargarlo), el texto y los hashtags para copiar, y
 * «Ya lo he publicado». Kreo no automatiza nada en TikTok: la publicación la hace la persona en la app de TikTok.
 */
export default async function TikTokHandoffPage({ params }: { params: Promise<{ projectId: string; postId: string }> }) {
  const { projectId, postId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(postId)) notFound();
  const project = await getProject(projectId);
  const t = await getTranslations("tiktok.handoff");
  const supabase = await createClient();
  const { data: post } = await supabase.from("posts").select("id, title, caption, asset_ids, ai_generated").eq("id", postId).eq("project_id", projectId).maybeSingle();
  if (!post) notFound();
  const { data: targets } = await supabase
    .from("post_targets")
    .select("id, status, error_code, caption_override, platform_options, social_accounts(platform, handle, display_name)")
    .eq("post_id", postId);
  const tiktok = (targets ?? []).filter((x) => x.social_accounts?.platform === "tiktok" && (x.status === AWAITING_USER_PUBLISH || x.status === "published"));

  // Vídeo de la publicación: URL firmada (1 h) que fuerza la descarga con un nombre de archivo limpio.
  let video: { url: string; fileName: string } | null = null;
  if (post.asset_ids.length) {
    const { data: assets } = await supabase.from("assets").select("id, storage_path, mime_type").in("id", post.asset_ids).eq("project_id", projectId);
    const v = post.asset_ids.map((id) => (assets ?? []).find((a) => a.id === id)).find((a) => a?.mime_type.startsWith("video/"));
    if (v) {
      const ext = v.storage_path.split(".").pop()?.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "mp4";
      const fileName = `kreo-tiktok-${post.id.slice(0, 8)}.${ext}`;
      const { data } = await supabase.storage.from("project-media").createSignedUrl(v.storage_path, 60 * 60, { download: fileName });
      if (data?.signedUrl) video = { url: data.signedUrl, fileName };
    }
  }

  const views: HandoffView[] = tiktok.map((x) => {
    const acc = x.social_accounts;
    const caption = x.caption_override ?? post.caption;
    const options = (x.platform_options ?? {}) as PlatformOptions;
    const handoff = parseHandoff(x.error_code);
    return {
      targetId: x.id,
      done: x.status === "published",
      mode: handoff?.mode ?? "manual",
      reason: handoff?.reason ?? null,
      account: acc?.handle ? `@${acc.handle.replace(/^@/, "")}` : (acc?.display_name ?? "TikTok"),
      caption,
      hashtags: [...new Set(extractHashtags(caption))],
      commercial: disclosureLabel(options),
    };
  });

  return (
    <div className="mx-auto w-full max-w-[860px] space-y-6">
      <div className="space-y-2">
        <Link href={`/app/p/${projectId}/posts/${postId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {t("back")}
        </Link>
        <h1 className="page-title">{t("title")}</h1>
        {post.title && <p className="text-sm text-muted-foreground">{post.title}</p>}
      </div>
      {views.length === 0 ? (
        <p className="rounded-md border bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">{t("nothing")}</p>
      ) : (
        views.map((v) => (
          <TikTokHandoffCard key={v.targetId} projectId={projectId} view={v} video={video} aiGenerated={post.ai_generated} canEdit={roleAtLeast(project.workspace.role, "editor")} />
        ))
      )}
    </div>
  );
}
