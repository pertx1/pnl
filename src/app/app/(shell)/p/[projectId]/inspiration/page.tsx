import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Bookmark, Quote } from "lucide-react";
import { isAgentsConfigured } from "@/lib/agents";
import { RESEARCH_CREDITS } from "@/lib/research/credits";
import { getCreditBalance, getProject, roleAtLeast } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { HooksLibrary, type HookView } from "./hooks-library";
import { SwipeFile, type SwipeView } from "./swipe-file";

export async function generateMetadata() {
  const t = await getTranslations("inspiration");
  return { title: t("title") };
}

type Search = { tab?: string; tag?: string; kind?: string; network?: string; niche?: string; format?: string };
const NETWORKS = ["youtube", "tiktok", "instagram", "facebook", "other"] as const;
const KINDS = ["video", "ad", "post"] as const;

export default async function InspirationPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Search> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const t = await getTranslations("inspiration");
  const project = await getProject(projectId);
  const canEdit = roleAtLeast(project.workspace.role, "editor");
  const supabase = await createClient();
  const tab = sp.tab === "hooks" ? "hooks" : "swipe";
  const aiEnabled = isAgentsConfigured();
  const balance = await getCreditBalance(project.workspace_id);
  const base = `/app/p/${projectId}/inspiration`;

  let content: React.ReactNode;
  if (tab === "swipe") {
    const filters = {
      tag: sp.tag && sp.tag.length <= 30 ? sp.tag : undefined,
      kind: KINDS.find((k) => k === sp.kind),
      network: NETWORKS.find((n) => n === sp.network),
    };
    let q = supabase
      .from("research_swipes")
      .select("id, url, network, kind, title, author_name, thumbnail_url, notes, tags")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(120);
    if (filters.tag) q = q.contains("tags", [filters.tag]);
    if (filters.kind) q = q.eq("kind", filters.kind);
    if (filters.network) q = q.eq("network", filters.network);
    const [{ data: swipes }, { data: tagRows }] = await Promise.all([q, supabase.from("research_swipes").select("tags").eq("project_id", projectId).limit(500)]);
    const allTags = [...new Set((tagRows ?? []).flatMap((r) => r.tags))].sort().slice(0, 40);
    const views: SwipeView[] = (swipes ?? []).map((s) => ({
      id: s.id,
      url: s.url,
      network: s.network,
      kind: s.kind,
      title: s.title,
      authorName: s.author_name,
      thumbnailUrl: s.thumbnail_url,
      notes: s.notes,
      tags: s.tags,
    }));
    content = (
      <SwipeFile projectId={projectId} swipes={views} allTags={allTags} filters={filters} canEdit={canEdit} aiEnabled={aiEnabled} remixCredits={RESEARCH_CREDITS.remixDraft} balance={balance} />
    );
  } else {
    const filters = { niche: sp.niche && sp.niche.length <= 80 ? sp.niche : undefined, format: sp.format && sp.format.length <= 40 ? sp.format : undefined };
    let q = supabase.from("research_hooks").select("id, text, niche, format, source").eq("project_id", projectId).order("created_at", { ascending: false }).limit(200);
    if (filters.niche) q = q.eq("niche", filters.niche);
    if (filters.format) q = q.eq("format", filters.format);
    const [{ data: hooks }, { data: nicheRows }] = await Promise.all([q, supabase.from("research_hooks").select("niche").eq("project_id", projectId).neq("niche", "").limit(1000)]);
    const niches = [...new Set((nicheRows ?? []).map((r) => r.niche))].sort().slice(0, 30);
    content = (
      <HooksLibrary
        projectId={projectId}
        hooks={(hooks ?? []) as HookView[]}
        niches={niches}
        filters={filters}
        canEdit={canEdit}
        aiEnabled={aiEnabled}
        credits={RESEARCH_CREDITS.generateHooks}
        balance={balance}
      />
    );
  }

  const tabCls = (on: boolean) =>
    cn("flex flex-1 items-center justify-center gap-2 rounded-sm px-3 py-1.5 text-sm sm:flex-none", on ? "bg-secondary font-semibold" : "text-muted-foreground hover:text-foreground");

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-6">
      <div>
        <h1 className="page-title">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <nav className="flex gap-1 rounded-md border p-0.5 sm:inline-flex" aria-label={t("tabs")}>
        <Link href={base} className={tabCls(tab === "swipe")} aria-current={tab === "swipe" ? "page" : undefined}>
          <Bookmark className="size-4" aria-hidden /> {t("tabSwipe")}
        </Link>
        <Link href={`${base}?tab=hooks`} className={tabCls(tab === "hooks")} aria-current={tab === "hooks" ? "page" : undefined}>
          <Quote className="size-4" aria-hidden /> {t("tabHooks")}
        </Link>
      </nav>
      {content}
    </div>
  );
}
