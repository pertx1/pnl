import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Hand } from "lucide-react";
import { getProject, roleAtLeast } from "@/lib/server/dal";
import { getEditorData } from "@/lib/server/posts";
import { getTemplatesData } from "@/lib/server/templates";
import type { PlatformOptions } from "@/lib/posts/rules";
import { createClient } from "@/lib/supabase/server";
import { AWAITING_USER_PUBLISH, tiktokDirectPostAudited } from "@/lib/social/tiktok-core";
import { PostEditor } from "../post-editor";

export default async function EditPostPage({ params }: { params: Promise<{ projectId: string; postId: string }> }) {
  const { projectId, postId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(postId)) notFound();
  const project = await getProject(projectId);
  const supabase = await createClient();
  const { data: post } = await supabase.from("posts").select("*").eq("id", postId).eq("project_id", projectId).maybeSingle();
  if (!post) notFound();
  const { data: targets } = await supabase.from("post_targets").select("social_account_id, caption_override, platform_options, status, error_code").eq("post_id", postId);
  const [{ accounts, assets }, tpl] = await Promise.all([getEditorData(projectId, post.asset_ids), getTemplatesData(projectId)]);

  // Destino de TikTok entregado al creador (borradores o subida a mano): falta que lo termine en TikTok.
  const awaitingTikTok = (targets ?? []).some((x) => x.status === AWAITING_USER_PUBLISH);
  const tt = await getTranslations("tiktok.handoff");

  return (
    <>
      {awaitingTikTok && (
        <div role="status" className="mx-auto mb-4 flex w-full max-w-[1360px] flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <Hand className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{tt("banner")}</span>
          <Link href={`/app/p/${projectId}/posts/${postId}/tiktok`} className="font-medium underline underline-offset-2">
            {tt("bannerCta")}
          </Link>
        </div>
      )}
      <PostEditor
        projectId={projectId}
        workspaceId={project.workspace_id}
        projectName={project.name}
        accounts={accounts}
        library={assets}
        canEdit={roleAtLeast(project.workspace.role, "editor")}
        canApprove={roleAtLeast(project.workspace.role, "admin")}
        tiktokAudited={tiktokDirectPostAudited(process.env.TIKTOK_DIRECT_POST_AUDITED)}
        templates={tpl.templates}
        snippets={tpl.snippets}
        templatesAvailable={tpl.available}
        initial={{
          postId,
          title: post.title ?? "",
          caption: post.caption,
          scheduledAt: post.scheduled_at,
          scheduledLocal: "",
          aiGenerated: post.ai_generated,
          assetIds: post.asset_ids,
          status: post.status,
          targets: (targets ?? []).map((t) => ({
            socialAccountId: t.social_account_id,
            captionOverride: t.caption_override ?? "",
            platformOptions: (t.platform_options ?? {}) as PlatformOptions,
          })),
        }}
      />
    </>
  );
}
