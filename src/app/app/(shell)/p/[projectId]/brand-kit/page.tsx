import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBrandKit, getProject, roleAtLeast } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";
import { BrandKitForm, type BrandKitValues } from "./brand-kit-form";
import { LogoUploader } from "./logo-uploader";

export async function generateMetadata() {
  const t = await getTranslations("brandKit");
  return { title: t("title") };
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export default async function BrandKitPage({ params }: PageProps<"/app/p/[projectId]/brand-kit">) {
  const { projectId } = await params;
  const t = await getTranslations("brandKit");
  const project = await getProject(projectId);
  const kit = await getBrandKit(projectId);
  const readOnly = !roleAtLeast(project.workspace.role, "editor");
  let logoUrl: string | null = null;
  if (kit.logo_path) {
    const supabase = await createClient();
    const { data } = await supabase.storage.from("brand-assets").createSignedUrl(kit.logo_path, 60 * 60);
    logoUrl = data?.signedUrl ?? null;
  }

  const initial: BrandKitValues = {
    tone_of_voice: kit.tone_of_voice ?? "",
    target_audience: kit.target_audience ?? "",
    banned_words: kit.banned_words.join(", "),
    colors: arr<{ name: string; hex: string }>(kit.colors),
    fonts: arr<{ role: string; family: string }>(kit.fonts),
    example_posts: arr<{ url: string; note: string }>(kit.example_posts),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="label-mono">{project.name}</p>
        <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("logo")}</CardTitle>
        </CardHeader>
        <CardContent>
          <LogoUploader projectId={projectId} workspaceId={project.workspace_id} logoUrl={logoUrl} readOnly={readOnly} />
        </CardContent>
      </Card>
      <BrandKitForm projectId={projectId} initial={initial} readOnly={readOnly} />
    </div>
  );
}
