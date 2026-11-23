import { getTranslations } from "next-intl/server";
import { AgendaView, type AgendaPost } from "@/components/agenda/agenda-view";
import { addDays, agendaBounds, daysBetween, expandBlocks, freeSlotsForRange, viewRange } from "@/lib/agenda/core";
import { loadAgenda, loadPlanCandidates } from "@/lib/agenda/server";
import { isIsoDay, zonedToUtc } from "@/lib/mcp/calendar";
import { getCurrentWorkspace, getProjects, requireUser } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("agenda");
  return { title: t("title") };
}

/**
 * «Mi agenda»: bloques de tiempo personales (solo los ve su dueño), huecos libres y «Planificar mi día/semana».
 * Todo con la sesión del usuario (RLS). Los cálculos de fechas viven en src/lib/agenda/core.ts (puros, con tests).
 */
export default async function AgendaPage({ searchParams }: PageProps<"/app/agenda">) {
  const sp = await searchParams;
  const view = sp.view === "week" ? "week" : "day";
  const dParam = typeof sp.d === "string" && isIsoDay(sp.d) ? sp.d : null;
  const openNew = sp.new === "1";
  const openPlan = sp.plan === "1";

  const [user, workspace, supabase] = await Promise.all([requireUser(), getCurrentWorkspace(), createClient()]);
  const first = agendaBounds();
  const roughAnchor = dParam ?? first.today;
  const margin = { from: addDays(roughAnchor, -8), to: addDays(roughAnchor, 8) };

  const [projects, agenda, { data: posts }] = await Promise.all([
    getProjects(workspace.id),
    loadAgenda(supabase, { userId: user.id, ...margin }),
    supabase
      .from("posts")
      .select("id, project_id, title, caption, status, scheduled_at, post_targets(social_accounts(platform))")
      .eq("workspace_id", workspace.id)
      .neq("status", "cancelled")
      .gte("scheduled_at", zonedToUtc(margin.from, 0, "UTC").toISOString())
      .lt("scheduled_at", zonedToUtc(margin.to, 0, "UTC").toISOString())
      .order("scheduled_at")
      .limit(300),
  ]);

  const tz = agenda.settings.timezone;
  const b = agendaBounds(first.nowMs, tz);
  const anchor = dParam ?? b.today;
  const range = viewRange(view, anchor);
  const days = daysBetween(range.from, range.to);
  const occurrences = expandBlocks(agenda.blocks, range.from, range.to);
  const free = freeSlotsForRange({ days, settings: agenda.settings, occurrences, nowMs: b.nowMs });

  // Lo que se puede repartir: hasta el final de la vista (y al menos una semana para que haya donde elegir).
  const horizon = range.to > b.in7 ? range.to : b.in7;
  const planned = expandBlocks(agenda.blocks, b.today, horizon);
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const candidates = agenda.available
    ? await loadPlanCandidates(supabase, {
        projectIds: projects.map((p) => p.id),
        projectNames,
        nowIso: b.nowIso,
        horizon,
        timezone: tz,
        alreadyPlanned: {
          taskIds: new Set(planned.map((o) => o.taskId).filter((x): x is string => !!x)),
          postIds: new Set(planned.map((o) => o.postId).filter((x): x is string => !!x)),
        },
      })
    : [];

  const agendaPosts: AgendaPost[] = (posts ?? []).map((p) => ({
    id: p.id,
    projectId: p.project_id,
    title: p.title?.trim() || p.caption.trim().slice(0, 80),
    status: p.status,
    scheduledAt: p.scheduled_at!,
    platforms: [...new Set((p.post_targets ?? []).map((x) => x.social_accounts?.platform).filter((x): x is NonNullable<typeof x> => !!x))],
  }));

  return (
    <AgendaView
      key={`${view}-${anchor}`}
      available={agenda.available}
      view={view}
      anchor={anchor}
      today={b.today}
      nowIso={b.nowIso}
      days={days}
      settings={agenda.settings}
      blocks={agenda.blocks}
      occurrences={occurrences}
      free={free}
      posts={agendaPosts}
      projects={projects.map((p, i) => ({ id: p.id, name: p.name, color: i }))}
      candidates={candidates}
      openNew={openNew}
      openPlan={openPlan}
    />
  );
}
