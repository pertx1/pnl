import { getTranslations } from "next-intl/server";
import { creditsFor, MODELS } from "@/lib/ai/catalog";
import { isElevenLabsConfigured, listVoices } from "@/lib/ai/providers/elevenlabs";
import { isFalConfigured } from "@/lib/ai/providers/fal";
import { getCreditBalance, getProject, roleAtLeast } from "@/lib/server/dal";
import { getEditorData } from "@/lib/server/posts";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { StudioWorkspace } from "./studio-workspace";

// La música (ElevenLabs) puede tardar 1-2 min: más margen para las acciones de servidor de esta página.
export const maxDuration = 300;

export async function generateMetadata() {
  const t = await getTranslations("studio");
  return { title: t("title") };
}

export default async function StudioPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const t = await getTranslations("studio");
  const ta = await getTranslations("studioAudio");
  const project = await getProject(projectId);
  const supabase = await createClient();
  const [balance, { assets }, { data: running }, voices] = await Promise.all([
    getCreditBalance(project.workspace_id),
    getEditorData(projectId),
    supabase.from("ai_generations").select("id, kind, params").eq("project_id", projectId).in("kind", ["image", "video"]).eq("status", "running").order("created_at", { ascending: false }),
    listVoices(),
  ]);
  const canEdit = roleAtLeast(project.workspace.role, "editor");
  const audioEnabled = isElevenLabsConfigured() && Boolean(createAdminClient()) && canEdit;
  const enabled = isFalConfigured() && Boolean(createAdminClient()) && canEdit;

  return (
    <div className="space-y-4">
      {!isFalConfigured() && (
        <p role="note" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {t("notConfigured")}
        </p>
      )}
      {!isElevenLabsConfigured() && (
        <p role="note" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {ta("notConfigured")}
        </p>
      )}

      <StudioWorkspace
        audio={{ enabled: audioEnabled, voices }}
        canPost={canEdit}
        projectId={projectId}
        balance={balance}
        enabled={enabled}
        pending={(running ?? []).map((r) => ({
          id: r.id,
          kind: r.kind,
          aspect: String(((r.params ?? {}) as { aspect?: string }).aspect ?? "9:16"),
        }))}
        assets={assets.map((a) => ({ id: a.id, url: a.url, mime: a.mime, ai: a.ai }))}
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
    </div>
  );
}
