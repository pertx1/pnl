import { getTranslations } from "next-intl/server";
import { getBrandKit, getProject, roleAtLeast } from "@/lib/server/dal";
import { BrandKitForm, type BrandKitValues } from "./brand-kit-form";

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
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <BrandKitForm projectId={projectId} initial={initial} readOnly={!roleAtLeast(project.workspace.role, "editor")} />
    </div>
  );
}
