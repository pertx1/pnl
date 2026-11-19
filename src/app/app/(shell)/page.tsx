import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { FolderPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentWorkspace, getPlan, getProjects, roleAtLeast } from "@/lib/server/dal";

export default async function ProjectsPage() {
  const t = await getTranslations("projects");
  const format = await getFormatter();
  const workspace = await getCurrentWorkspace();
  const [projects, plan] = await Promise.all([getProjects(workspace.id), getPlan(workspace.planId)]);
  const canCreate = roleAtLeast(workspace.role, "admin") && projects.length < plan.max_projects;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-mono">{workspace.name}</p>
          <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground">
            {t("limit", { used: projects.length, max: plan.max_projects })}
          </span>
          {canCreate && (
            <Button asChild>
              <Link href="/app/projects/new">
                <Plus /> {t("new")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <FolderPlus className="size-10 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <p className="max-w-sm text-muted-foreground">{t("empty")}</p>
            {canCreate && (
              <Button asChild>
                <Link href="/app/projects/new">{t("new")}</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/app/p/${p.id}`} className="group rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
              <Card className="h-full transition-colors group-hover:border-selected/50">
                <CardHeader>
                  <CardTitle>{p.name}</CardTitle>
                  {p.description && <CardDescription className="line-clamp-2">{p.description}</CardDescription>}
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-xs text-muted-foreground">
                    {t("createdAt", { date: format.dateTime(new Date(p.created_at), { dateStyle: "medium" }) })}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
