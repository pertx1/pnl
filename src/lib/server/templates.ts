import "server-only";
import type { TemplateOptions } from "@/lib/posts/templates";
import { createClient } from "@/lib/supabase/server";
import type { SnippetKind } from "@/lib/supabase/types/templates";

export type TemplateDTO = {
  id: string;
  name: string;
  title: string;
  caption: string;
  hashtags: string[];
  accountIds: string[];
  options: TemplateOptions;
  preferredTime: string | null;
};
export type SnippetDTO = { id: string; kind: SnippetKind; name: string; content: string };
export type SeriesDTO = { id: string; name: string; createdAt: string; templateId: string | null; counts: Record<string, number>; firstAt: string | null; lastAt: string | null };

/** Tabla aún no creada (migración pendiente): la UI lo muestra como "pendiente de configurar" sin romper. */
const isMissingTable = (e: { code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205");

export function toTemplateDTO(t: {
  id: string;
  name: string;
  title: string | null;
  caption: string;
  hashtags: string[];
  social_account_ids: string[];
  platform_options: unknown;
  preferred_time: string | null;
}): TemplateDTO {
  return {
    id: t.id,
    name: t.name,
    title: t.title ?? "",
    caption: t.caption,
    hashtags: t.hashtags,
    accountIds: t.social_account_ids,
    options: (t.platform_options ?? {}) as TemplateOptions,
    preferredTime: t.preferred_time,
  };
}

/** Plantillas y textos guardados de un proyecto (con la sesión del usuario → RLS). */
export async function getTemplatesData(projectId: string): Promise<{ available: boolean; templates: TemplateDTO[]; snippets: SnippetDTO[] }> {
  const supabase = await createClient();
  const [tpl, snp] = await Promise.all([
    supabase
      .from("post_templates")
      .select("id, name, title, caption, hashtags, social_account_ids, platform_options, preferred_time")
      .eq("project_id", projectId)
      .order("name")
      .limit(200),
    supabase.from("post_snippets").select("id, kind, name, content").eq("project_id", projectId).order("name").limit(300),
  ]);
  if (isMissingTable(tpl.error) || isMissingTable(snp.error)) return { available: false, templates: [], snippets: [] };
  return {
    available: true,
    templates: (tpl.data ?? []).map(toTemplateDTO),
    snippets: (snp.data ?? []).map((s) => ({ id: s.id, kind: s.kind, name: s.name, content: s.content })),
  };
}

/** Series recientes del proyecto con el recuento de publicaciones por estado (2 consultas, sin N+1). */
export async function getSeriesList(projectId: string): Promise<SeriesDTO[]> {
  const supabase = await createClient();
  const { data: series, error } = await supabase
    .from("post_series")
    .select("id, name, created_at, template_id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !series?.length) return [];
  const { data: posts } = await supabase
    .from("posts")
    .select("series_id, status, scheduled_at")
    .in(
      "series_id",
      series.map((s) => s.id),
    )
    .limit(2000);
  return series.map((s) => {
    const mine = (posts ?? []).filter((p) => p.series_id === s.id);
    const counts: Record<string, number> = {};
    for (const p of mine) counts[p.status] = (counts[p.status] ?? 0) + 1;
    const times = mine.map((p) => p.scheduled_at).filter(Boolean).sort() as string[];
    return { id: s.id, name: s.name, createdAt: s.created_at, templateId: s.template_id, counts, firstAt: times[0] ?? null, lastAt: times[times.length - 1] ?? null };
  });
}

/** Una plantilla del proyecto (o null). */
export async function getTemplate(projectId: string, templateId: string): Promise<TemplateDTO | null> {
  if (!/^[0-9a-f-]{36}$/i.test(templateId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("post_templates")
    .select("id, name, title, caption, hashtags, social_account_ids, platform_options, preferred_time")
    .eq("id", templateId)
    .eq("project_id", projectId)
    .maybeSingle();
  return data ? toTemplateDTO(data) : null;
}
