import { getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { AiBadge } from "@/components/kreo/ai-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { creditsFor, MODELS } from "@/lib/ai/catalog";
import { isFalConfigured } from "@/lib/ai/providers/fal";
import { getCreditBalance, getProject, roleAtLeast } from "@/lib/server/dal";
import { getEditorData } from "@/lib/server/posts";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { StudioForm } from "./studio-form";

export async function generateMetadata() {
  const t = await getTranslations("studio");
  return { title: t("title") };
}

export default async function StudioPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const t = await getTranslations("studio");
  const project = await getProject(projectId);
  const supabase = await createClient();
  const [balance, { assets }, { data: running }] = await Promise.all([
    getCreditBalance(project.workspace_id),
    getEditorData(projectId),
    supabase.from("ai_generations").select("id").eq("project_id", projectId).eq("kind", "video").eq("status", "running").order("created_at"),
  ]);
  const enabled = isFalConfigured() && Boolean(createAdminClient()) && roleAtLeast(project.workspace.role, "editor");

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
        pendingIds={(running ?? []).map((r) => r.id)}
        images={assets.filter((a) => a.mime.startsWith("image/")).map((a) => ({ id: a.id, url: a.url }))}
        models={MODELS.map((m) => ({
          id: m.id,
          kind: m.kind,
          label: m.label,
          tagline: m.tagline,
          tier: m.tier,
          usdPerUnit: m.usdPerUnit,
          durations: m.durations ?? [],
          needsImage: Boolean(m.needsImage),
          modelPage: m.modelPage,
          creditsByDuration: Object.fromEntries((m.durations ?? [0]).map((dur) => [dur, creditsFor(m, dur || undefined)])),
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("gallery")}</CardTitle>
        </CardHeader>
        <CardContent>
          {assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("galleryEmpty")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {assets.map((a) => (
                <figure key={a.id} className="overflow-hidden rounded-lg border bg-secondary">
                  {a.url &&
                    (a.mime.startsWith("video/") ? (
                      <video src={a.url} className="aspect-square w-full object-cover" controls muted playsInline preload="metadata" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt="" className="aspect-square w-full object-cover" />
                    ))}
                  <figcaption className="flex items-center justify-between gap-2 p-2">
                    {a.ai ? <AiBadge /> : <span />}
                    {a.url && (
                      <a href={a.url} download className="text-muted-foreground hover:text-foreground" aria-label={t("download")}>
                        <Download className="size-4" />
                      </a>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
