import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, CalendarDays, Palette, Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBrandKit, getProject } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/app/p/[projectId]">) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  return { title: project.name };
}

export default async function ProjectPage({ params }: PageProps<"/app/p/[projectId]">) {
  const { projectId } = await params;
  const t = await getTranslations("projects");
  const tc = await getTranslations("common");
  const project = await getProject(projectId);
  const kit = await getBrandKit(projectId);
  const kitDone = Boolean(kit.tone_of_voice && kit.target_audience);
  const supabase = await createClient();
  const [{ count: accountsCount }, { count: postsCount }] = await Promise.all([
    supabase.from("social_accounts").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("project_id", projectId).in("status", ["scheduled", "published"]),
  ]);

  const steps: { icon: typeof Palette; title: string; body: string; href?: string; done?: boolean; soon?: boolean }[] = [
    { icon: Palette, title: t("stepBrandKit"), body: t("stepBrandKitBody"), href: `/app/p/${projectId}/brand-kit`, done: kitDone },
    { icon: Plug, title: t("stepAccounts"), body: t("stepAccountsBody"), href: `/app/p/${projectId}/accounts`, done: (accountsCount ?? 0) > 0 },
    { icon: CalendarDays, title: t("stepCalendar"), body: t("stepCalendarBody"), href: `/app/p/${projectId}/calendar`, done: (postsCount ?? 0) > 0 },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="label-mono">{project.workspace.name}</p>
        <h1 className="text-[28px] leading-tight font-medium">{project.name}</h1>
        {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
      </div>

      <section className="space-y-3">
        <h2 className="label-mono">{t("nextSteps")}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {steps.map((s, i) => {
            const card = (
              <Card className={s.href ? "h-full transition-colors hover:border-selected/50" : "h-full opacity-70"}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                    {s.done ? <Badge>OK</Badge> : s.soon ? <Badge variant="outline">{tc("soon")}</Badge> : null}
                  </div>
                  <CardTitle className="flex items-center gap-2">
                    <s.icon className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                    {s.title}
                  </CardTitle>
                  <CardDescription>{s.body}</CardDescription>
                </CardHeader>
                {s.href && (
                  <CardContent>
                    <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                  </CardContent>
                )}
              </Card>
            );
            return s.href ? (
              <Link key={s.title} href={s.href} className="rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
                {card}
              </Link>
            ) : (
              <div key={s.title}>{card}</div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
