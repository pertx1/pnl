import { getTranslations } from "next-intl/server";
import { getProject, roleAtLeast } from "@/lib/server/dal";
import { getEditorData } from "@/lib/server/posts";
import { PostEditor } from "../post-editor";

export async function generateMetadata() {
  const t = await getTranslations("posts");
  return { title: t("new") };
}

export default async function NewPostPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ date?: string; caption?: string }> }) {
  const { projectId } = await params;
  const { date, caption } = await searchParams;
  const project = await getProject(projectId);
  const { accounts, assets } = await getEditorData(projectId);
  const initialDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T19:00` : "";
  // Borrador inicial (p. ej. "Crear algo parecido" desde Inspiración). Solo texto; el usuario lo revisa antes de nada.
  const initialCaption = typeof caption === "string" ? caption.slice(0, 5000) : "";
  return (
    <PostEditor
      projectId={projectId}
      workspaceId={project.workspace_id}
      projectName={project.name}
      accounts={accounts}
      library={assets}
      canEdit={roleAtLeast(project.workspace.role, "editor")}
      canApprove={roleAtLeast(project.workspace.role, "admin")}
      initial={{ title: "", caption: initialCaption, scheduledLocal: initialDate, aiGenerated: false, assetIds: [], targets: [], status: "draft" }}
    />
  );
}
