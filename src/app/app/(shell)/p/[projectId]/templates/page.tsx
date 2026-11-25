import { getTranslations } from "next-intl/server";
import { getProject, roleAtLeast } from "@/lib/server/dal";
import type { EditorAccount } from "@/lib/server/posts";
import { getSeriesList, getTemplatesData } from "@/lib/server/templates";
import { createClient } from "@/lib/supabase/server";
import { TemplatesManager } from "./templates-manager";

export async function generateMetadata() {
  const t = await getTranslations("templates");
  return { title: t("metaTitle") };
}

export default async function TemplatesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const t = await getTranslations("templates");
  const project = await getProject(projectId);
  const supabase = await createClient();
  const [data, series, { data: accounts }] = await Promise.all([
    getTemplatesData(projectId),
    getSeriesList(projectId),
    supabase.from("social_accounts").select("id, platform, handle, display_name, status").eq("project_id", projectId).order("created_at"),
  ]);

  if (!data.available) {
    return (
      <div className="mx-auto w-full max-w-[1360px] space-y-4">
        <div>
          <h1 className="page-title">{t("title")}</h1>
        </div>
        <p role="note" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {t("notConfigured")}
        </p>
      </div>
    );
  }

  return (
    <TemplatesManager
      projectId={projectId}
      projectName={project.name}
      canEdit={roleAtLeast(project.workspace.role, "editor")}
      templates={data.templates}
      snippets={data.snippets}
      series={series}
      accounts={(accounts ?? []) as EditorAccount[]}
    />
  );
}
