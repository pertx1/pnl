import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Contexto de marca (brand kit) que se añade a lo que genera la IA. Sin datos personales. */
export async function getBrandContext(projectId: string) {
  const supabase = await createClient();
  const { data: kit } = await supabase.from("brand_kits").select("tone_of_voice, target_audience, banned_words, colors").eq("project_id", projectId).maybeSingle();
  const colors = Array.isArray(kit?.colors) ? (kit!.colors as { name?: string; hex?: string }[]).map((c) => c.hex).filter(Boolean) : [];
  return {
    tone: kit?.tone_of_voice ?? "",
    audience: kit?.target_audience ?? "",
    bannedWords: kit?.banned_words ?? [],
    colors: colors as string[],
  };
}

/** Pista de estilo visual para modelos de imagen. */
export function imageStyleHint(ctx: Awaited<ReturnType<typeof getBrandContext>>) {
  return ctx.colors.length ? `Brand color palette: ${ctx.colors.slice(0, 5).join(", ")}.` : "";
}
