"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarRange, Clock, FilePlus2, Hash, LayoutTemplate, Pencil, Plus, Quote, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge, type PostStatus } from "@/components/kreo/status-badge";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { countHashtags } from "@/lib/posts/rules";
import { extractPlaceholders } from "@/lib/posts/templates";
import { SERIES_TZ } from "@/lib/posts/series";
import type { EditorAccount } from "@/lib/server/posts";
import type { SeriesDTO, SnippetDTO, TemplateDTO } from "@/lib/server/templates";
import { deleteSeriesDrafts, deleteSnippet, deleteTemplate } from "./actions";
import { SeriesDialog, seriesDefaults, type SeriesDefaults } from "./series-dialog";
import { handleOf, SnippetDialog, TemplateFormDialog } from "./template-dialogs";

type DialogState =
  | { kind: "template"; template?: TemplateDTO }
  | { kind: "snippet"; snippetKind: "hashtags" | "text"; snippet?: SnippetDTO }
  | { kind: "series"; template: TemplateDTO; defaults: SeriesDefaults }
  | null;

const STATUSES: PostStatus[] = ["draft", "pending_approval", "approved", "scheduled", "publishing", "published", "failed", "cancelled"];

export function TemplatesManager({
  projectId,
  canEdit,
  templates,
  snippets,
  series,
  accounts,
}: {
  projectId: string;
  projectName: string;
  canEdit: boolean;
  templates: TemplateDTO[];
  snippets: SnippetDTO[];
  series: SeriesDTO[];
  accounts: EditorAccount[];
}) {
  const t = useTranslations("templates");
  const te = useTranslations("templates.errors");
  const tp = useTranslations("posts");
  const format = useFormatter();
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pending, start] = useTransition();
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const fail = (e: string) => {
    toast.error(te.has(e) ? te(e) : te("generic"));
  };

  function remove(kind: "template" | "snippet", id: string, name: string) {
    if (!window.confirm(kind === "template" ? t("card.deleteConfirm", { name }) : t("snippets.deleteConfirm", { name }))) return;
    start(async () => {
      const r = kind === "template" ? await deleteTemplate(projectId, id) : await deleteSnippet(projectId, id);
      if (!r.ok) return fail(r.error);
      toast.success(kind === "template" ? t("card.deleted") : t("snippets.deleted"));
      router.refresh();
    });
  }

  function removeSeriesDrafts(s: SeriesDTO) {
    if (!window.confirm(t("seriesList.deleteConfirm", { name: s.name }))) return;
    start(async () => {
      const r = await deleteSeriesDrafts(projectId, s.id);
      if (!r.ok) return fail(r.error);
      toast.success(t("seriesList.deleted", { deleted: r.data.deleted, kept: r.data.kept }));
      router.refresh();
    });
  }

  const day = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short", timeZone: SERIES_TZ });

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="page-title">{t("title")}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        {canEdit && (
          <Button onClick={() => setDialog({ kind: "template" })}>
            <Plus aria-hidden /> {t("new")}
          </Button>
        )}
      </div>

      {!canEdit && <p className="rounded-md border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">{t("readOnly")}</p>}

      {/* ------------------------------------------------------------------ Plantillas */}
      <section aria-labelledby="tpl-title" className="space-y-3">
        <h2 id="tpl-title" className="label-mono">
          {t("sectionTemplates")}
        </h2>
        {templates.length === 0 ? (
          <div className="bg-dots flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
            <LayoutTemplate className="size-7 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <div className="space-y-1">
              <p className="font-medium">{t("emptyTitle")}</p>
              <p className="max-w-md text-sm text-muted-foreground">{t("emptyBody")}</p>
            </div>
            {canEdit && (
              <Button variant="outline" onClick={() => setDialog({ kind: "template" })}>
                <Plus aria-hidden /> {t("new")}
              </Button>
            )}
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((tpl) => {
              const accs = tpl.accountIds.map((id) => accountById.get(id)).filter((a): a is EditorAccount => Boolean(a));
              const holes = extractPlaceholders(tpl.title, tpl.caption);
              return (
                <li key={tpl.id} className="surface flex flex-col gap-3 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 font-medium break-words">{tpl.name}</h3>
                    {canEdit && (
                      <div className="-mt-1 -mr-1 flex shrink-0">
                        <Button size="icon-sm" variant="ghost" aria-label={t("card.edit", { name: tpl.name })} onClick={() => setDialog({ kind: "template", template: tpl })}>
                          <Pencil aria-hidden />
                        </Button>
                        <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={t("card.delete", { name: tpl.name })} onClick={() => remove("template", tpl.id, tpl.name)}>
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">{tpl.caption || t("card.noCaption")}</p>
                  {holes.length > 0 && (
                    <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      <span>{t("card.placeholders")}</span>
                      {holes.map((h) => (
                        <code key={h} className="rounded-sm bg-secondary px-1 font-mono">{`{${h}}`}</code>
                      ))}
                    </p>
                  )}
                  <dl className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <dt className="sr-only">{t("card.accounts")}</dt>
                      <dd className="flex items-center gap-1">
                        {accs.length === 0
                          ? t("card.noAccounts")
                          : accs.map((a) => (
                              <span key={a.id} className="inline-flex items-center gap-1" title={handleOf(a)}>
                                <PlatformIcon platform={a.platform} className="size-4" label />
                              </span>
                            ))}
                      </dd>
                    </div>
                    <div className="flex items-center gap-1">
                      <dt className="sr-only">{t("card.time")}</dt>
                      <Clock className="size-3.5" aria-hidden />
                      <dd className="font-mono tabular-nums">{tpl.preferredTime ?? t("card.noTime")}</dd>
                    </div>
                    <div className="flex items-center gap-1">
                      <dt className="sr-only">{t("card.hashtagsLabel")}</dt>
                      <Hash className="size-3.5" aria-hidden />
                      <dd className="font-mono tabular-nums">{t("card.hashtags", { count: tpl.hashtags.length })}</dd>
                    </div>
                  </dl>
                  {canEdit && (
                    <div className="flex flex-wrap gap-2 border-t pt-3">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/app/p/${projectId}/posts/new?template=${tpl.id}`} aria-label={t("card.useLabel", { name: tpl.name })}>
                          <FilePlus2 aria-hidden /> {t("card.use")}
                        </Link>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "series", template: tpl, defaults: seriesDefaults() })}>
                        <Repeat aria-hidden /> {t("card.series")}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------------------ Textos guardados */}
      <section id="snippets" aria-labelledby="snp-title" className="scroll-mt-20 space-y-3">
        <div>
          <h2 id="snp-title" className="label-mono">
            {t("sectionSnippets")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("snippets.intro")}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {(["hashtags", "text"] as const).map((kind) => {
            const items = snippets.filter((s) => s.kind === kind);
            const Icon = kind === "hashtags" ? Hash : Quote;
            return (
              <div key={kind} className="surface space-y-3 rounded-xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-medium">
                    <Icon className="size-4 text-muted-foreground" aria-hidden /> {kind === "hashtags" ? t("snippets.hashtagsTitle") : t("snippets.textsTitle")}
                  </h3>
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "snippet", snippetKind: kind })}>
                      <Plus aria-hidden /> {kind === "hashtags" ? t("snippets.newHashtags") : t("snippets.newText")}
                    </Button>
                  )}
                </div>
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{kind === "hashtags" ? t("snippets.emptyHashtags") : t("snippets.emptyTexts")}</p>
                ) : (
                  <ul className="divide-y">
                    {items.map((s) => (
                      <li key={s.id} className="flex items-start gap-2 py-2">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="text-sm font-medium break-words">{s.name}</p>
                          <p className="line-clamp-2 text-xs break-words text-muted-foreground">{s.content}</p>
                          <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                            {kind === "hashtags" ? t("snippets.hashtagCount", { count: countHashtags(s.content) }) : t("snippets.chars", { count: s.content.length })}
                          </p>
                        </div>
                        {canEdit && (
                          <div className="flex shrink-0">
                            <Button size="icon-sm" variant="ghost" aria-label={t("snippets.edit", { name: s.name })} onClick={() => setDialog({ kind: "snippet", snippetKind: kind, snippet: s })}>
                              <Pencil aria-hidden />
                            </Button>
                            <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={t("snippets.delete", { name: s.name })} onClick={() => remove("snippet", s.id, s.name)}>
                              <Trash2 aria-hidden />
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------------ Series */}
      <section aria-labelledby="ser-title" className="space-y-3">
        <h2 id="ser-title" className="label-mono">
          {t("sectionSeries")}
        </h2>
        {series.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("seriesList.empty")}</p>
        ) : (
          <ul className="surface divide-y rounded-xl">
            {series.map((s) => {
              const total = Object.values(s.counts).reduce((a, b) => a + b, 0);
              const removable = (s.counts.draft ?? 0) + (s.counts.pending_approval ?? 0);
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <CalendarRange className="size-4 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words">{s.name}</p>
                    <p className="font-mono text-xs text-muted-foreground tabular-nums">
                      {s.firstAt && s.lastAt ? t("seriesList.range", { from: day(s.firstAt), to: day(s.lastAt), count: total }) : t("seriesList.noPosts")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUSES.filter((st) => s.counts[st]).map((st) => (
                      <span key={st} className="inline-flex items-center gap-1">
                        <StatusBadge status={st} label={tp.has(`status.${st}`) ? tp(`status.${st}`) : undefined} />
                        <span className="font-mono text-xs tabular-nums">×{s.counts[st]}</span>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/app/p/${projectId}/calendar?view=list`}>{t("seriesList.calendar")}</Link>
                    </Button>
                    {canEdit && removable > 0 && (
                      <Button size="sm" variant="destructive" disabled={pending} onClick={() => removeSeriesDrafts(s)}>
                        <Trash2 aria-hidden /> {t("seriesList.deleteDrafts", { count: removable })}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {dialog?.kind === "template" && <TemplateFormDialog projectId={projectId} accounts={accounts} template={dialog.template} onClose={() => setDialog(null)} />}
      {dialog?.kind === "snippet" && <SnippetDialog projectId={projectId} kind={dialog.snippetKind} snippet={dialog.snippet} onClose={() => setDialog(null)} />}
      {dialog?.kind === "series" && <SeriesDialog projectId={projectId} template={dialog.template} defaults={dialog.defaults} onClose={() => setDialog(null)} />}
    </div>
  );
}
