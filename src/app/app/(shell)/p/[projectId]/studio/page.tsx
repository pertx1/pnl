import { getTranslations } from "next-intl/server";
import { AiBadge } from "@/components/kreo/ai-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IMAGE_MODELS } from "@/lib/ai/catalog";
import { isFalConfigured } from "@/lib/ai/providers/fal";
import { getCreditBalance, getProject, roleAtLeast } from "@/lib/server/dal";
import { getEditorData } from "@/lib/server/posts";
import { createAdminClient } from "@/lib/supabase/admin";
import { StudioForm } from "./studio-form";

export async function generateMetadata() {
  const t = await getTranslations("studio");
  return { title: t("title") };
}

export default async function StudioPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const t = await getTranslations("studio");
  const project = await getProject(projectId);
  const [balance, { assets }] = await Promise.all([getCreditBalance(project.workspace_id), getEditorData(projectId)]);
  const enabled = isFalConfigured() && Boolean(createAdminClient()) && roleAtLeast(project.workspace.role, "editor");
  const images = assets.filter((a) => a.mime.startsWith("image/"));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="label-mono">{project.name}</p>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {!isFalConfigured() && (
        <p role="note" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {t("notConfigured")}
        </p>
      )}

      <StudioForm
        projectId={projectId}
        balance={balance}
        enabled={enabled}
        models={IMAGE_MODELS.map((m) => ({ id: m.id, label: m.label, credits: m.credits, licenseName: m.license.name, licenseUrl: m.license.url }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("gallery")}</CardTitle>
        </CardHeader>
        <CardContent>
          {images.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("galleryEmpty")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {images.map((a) => (
                <figure key={a.id} className="overflow-hidden rounded-lg border bg-secondary">
                  {a.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt="" className="aspect-square w-full object-cover" />
                  )}
                  <figcaption className="flex items-center justify-between p-2">{a.ai ? <AiBadge /> : <span />}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
