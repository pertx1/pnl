import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentWorkspace, roleAtLeast } from "@/lib/server/dal";
import { NewProjectForm } from "./new-project-form";

export async function generateMetadata() {
  const t = await getTranslations("projects");
  return { title: t("new") };
}

export default async function NewProjectPage() {
  const workspace = await getCurrentWorkspace();
  if (!roleAtLeast(workspace.role, "admin")) redirect("/app");
  return (
    <div className="mx-auto max-w-lg">
      <NewProjectForm workspaceId={workspace.id} />
    </div>
  );
}
