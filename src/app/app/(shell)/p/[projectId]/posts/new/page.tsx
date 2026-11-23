import { getTranslations } from "next-intl/server";
import { appendHashtags, optionsForPlatform } from "@/lib/posts/templates";
import { getProject, roleAtLeast } from "@/lib/server/dal";
import { getEditorData } from "@/lib/server/posts";
import { getTemplatesData } from "@/lib/server/templates";
import { PostEditor } from "../post-editor";

export async function generateMetadata() {
  const t = await getTranslations("posts");
  return { title: t("new") };
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function NewPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ date?: string; caption?: string; asset?: string | string[]; template?: string }>;
}) {
  const { projectId } = await params;
  const { date, caption, asset, template } = await searchParams;
  const project = await getProject(projectId);
  // «Usar en una publicación» (Estudio): medios de la biblioteca del proyecto que llegan ya añadidos.
  const wantedAssets = [...new Set((Array.isArray(asset) ? asset : asset ? [asset] : []).filter((id) => UUID_RE.test(id)))].slice(0, 10);
  const [{ accounts, assets }, tpl] = await Promise.all([getEditorData(projectId, wantedAssets), getTemplatesData(projectId)]);
  const preset = assets.filter((a) => wantedAssets.includes(a.id) && (a.mime.startsWith("image/") || a.mime.startsWith("video/")));

  // «Usar» una plantilla: texto, hashtags, cuentas y opciones por red. Los huecos {tema} se rellenan en el editor.
  const fromTemplate = template && UUID_RE.test(template) ? tpl.templates.find((x) => x.id === template) : undefined;
  const initialDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T${fromTemplate?.preferredTime ?? "19:00"}` : "";
  // Borrador inicial (p. ej. "Crear algo parecido" desde Inspiración). Solo texto; el usuario lo revisa antes de nada.
  const initialCaption = fromTemplate ? appendHashtags(fromTemplate.caption, fromTemplate.hashtags) : typeof caption === "string" ? caption.slice(0, 5000) : "";
  const targets = fromTemplate
    ? fromTemplate.accountIds
        .map((id) => accounts.find((a) => a.id === id))
        .filter((a) => a !== undefined)
        .map((a) => ({ socialAccountId: a.id, captionOverride: "", platformOptions: optionsForPlatform(fromTemplate.options, a.platform) }))
    : [];

  return (
    <PostEditor
      projectId={projectId}
      workspaceId={project.workspace_id}
      projectName={project.name}
      accounts={accounts}
      library={assets}
      canEdit={roleAtLeast(project.workspace.role, "editor")}
      canApprove={roleAtLeast(project.workspace.role, "admin")}
      templates={tpl.templates}
      snippets={tpl.snippets}
      templatesAvailable={tpl.available}
      preferredTime={fromTemplate?.preferredTime ?? null}
      initial={{
        title: fromTemplate?.title ?? "",
        caption: initialCaption,
        scheduledLocal: initialDate,
        // La etiqueta IA se hereda del medio (y el servidor la fuerza al guardar si algún medio es generado con IA).
        aiGenerated: preset.some((a) => a.ai),
        assetIds: preset.map((a) => a.id),
        targets,
        status: "draft",
      }}
    />
  );
}
