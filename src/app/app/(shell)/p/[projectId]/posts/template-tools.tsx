"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { BookmarkPlus, ChevronDown, Hash, LayoutTemplate, Quote, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlatformOptions } from "@/lib/posts/rules";
import { captionStats, splitTrailingHashtags, templateOptionsFromTargets } from "@/lib/posts/templates";
import type { SnippetDTO, TemplateDTO } from "@/lib/server/templates";
import { cn } from "@/lib/utils";
import { saveTemplate } from "../templates/actions";

/** «Empezar desde plantilla» + «Guardar como plantilla» (barra superior del editor). */
export function TemplateBar({
  projectId,
  templates,
  available,
  onApply,
  saveDisabled,
  current,
}: {
  projectId: string;
  templates: TemplateDTO[];
  available: boolean;
  onApply: (t: TemplateDTO) => void;
  saveDisabled: boolean;
  current: () => { title: string; caption: string; scheduled: string; targets: { id: string; platform: string; options: PlatformOptions }[] };
}) {
  const t = useTranslations("templates.editor");
  const [open, setOpen] = useState(false);
  if (!available) return <p className="text-xs text-muted-foreground">{t("notConfigured")}</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <LayoutTemplate aria-hidden /> {t("fromTemplate")} <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 min-w-60 overflow-y-auto">
          <DropdownMenuLabel>{t("fromTemplate")}</DropdownMenuLabel>
          {templates.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("noTemplates")}</p>}
          {templates.map((tpl) => (
            <DropdownMenuItem key={tpl.id} onSelect={() => onApply(tpl)} className="flex-col items-start gap-0.5">
              <span className="font-medium">{tpl.name}</span>
              {tpl.caption && <span className="line-clamp-1 text-xs text-muted-foreground">{tpl.caption}</span>}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={`/app/p/${projectId}/templates`}>
              <Settings2 aria-hidden /> {t("manage")}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button type="button" variant="ghost" size="sm" disabled={saveDisabled} onClick={() => setOpen(true)}>
        <BookmarkPlus aria-hidden /> {t("saveAsTemplate")}
      </Button>
      {open && <SaveTemplateDialog projectId={projectId} onClose={() => setOpen(false)} current={current()} />}
    </div>
  );
}

function SaveTemplateDialog({
  projectId,
  onClose,
  current,
}: {
  projectId: string;
  onClose: () => void;
  current: { title: string; caption: string; scheduled: string; targets: { id: string; platform: string; options: PlatformOptions }[] };
}) {
  const t = useTranslations("templates.editor");
  const te = useTranslations("templates.errors");
  const uid = useId();
  const [name, setName] = useState(current.title.slice(0, 80));
  const [time, setTime] = useState(/T(\d{2}:\d{2})/.exec(current.scheduled)?.[1] ?? "");
  const [pending, start] = useTransition();
  const hasTikTok = current.targets.some((x) => x.platform === "tiktok");

  function save() {
    start(async () => {
      const { body, hashtags } = splitTrailingHashtags(current.caption);
      const res = await saveTemplate({
        projectId,
        name,
        title: current.title,
        caption: body,
        hashtags,
        accountIds: current.targets.map((x) => x.id),
        options: templateOptionsFromTargets(current.targets),
        preferredTime: time || null,
      });
      if (!res.ok) {
        toast.error(te.has(res.error) ? te(res.error) : te("generic"));
        return;
      }
      toast.success(t("savedTemplate", { name }));
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("saveTitle")}</DialogTitle>
          <DialogDescription>{t("saveBody")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`${uid}-name`}>{t("templateName")}</Label>
            <Input id={`${uid}-name`} value={name} maxLength={80} required autoFocus placeholder={t("templateNamePlaceholder")} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${uid}-time`}>{t("preferredTime")}</Label>
            <Input id={`${uid}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-describedby={`${uid}-time-hint`} className="w-36 font-mono tabular-nums" />
            <p id={`${uid}-time-hint`} className="text-xs text-muted-foreground">
              {t("preferredTimeHint")}
            </p>
          </div>
          {hasTikTok && <p className="rounded-md border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">{t("tiktokNote")}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Grupos de hashtags y textos guardados: se insertan en el cursor con un clic. */
export function SnippetChips({ projectId, snippets, onInsert, disabled }: { projectId: string; snippets: SnippetDTO[]; onInsert: (s: SnippetDTO) => void; disabled?: boolean }) {
  const t = useTranslations("templates.editor");
  if (!snippets.length) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("noSnippets")}{" "}
        <Link className="link" href={`/app/p/${projectId}/templates#snippets`}>
          {t("createSnippets")}
        </Link>
      </p>
    );
  }
  const groups = (["hashtags", "text"] as const).map((kind) => ({ kind, items: snippets.filter((s) => s.kind === kind) })).filter((g) => g.items.length);
  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <div key={g.kind} role="group" aria-label={g.kind === "hashtags" ? t("hashtagGroups") : t("savedTexts")} className="flex flex-wrap items-center gap-1.5">
          <span className="label-mono mr-1 inline-flex items-center gap-1">
            {g.kind === "hashtags" ? <Hash className="size-3" aria-hidden /> : <Quote className="size-3" aria-hidden />}
            {g.kind === "hashtags" ? t("hashtagGroups") : t("savedTexts")}
          </span>
          {g.items.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={disabled}
              title={s.content}
              aria-label={t("insert", { name: s.name })}
              onMouseDown={(e) => e.preventDefault()} // conserva la selección del texto
              onClick={() => onInsert(s)}
              className="inline-flex min-h-8 items-center rounded-full border bg-background px-3 text-xs hover:border-border-strong hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50 pointer-coarse:min-h-11"
            >
              {s.name}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Contadores de caracteres y hashtags por red (según rules.ts). */
export function CaptionCounters({ text, platforms }: { text: string; platforms: string[] }) {
  const t = useTranslations("templates.editor");
  const stats = captionStats(text, platforms.length ? platforms : ["instagram", "tiktok", "youtube"]);
  return (
    <ul aria-label={t("counters")} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {stats.map((s) => (
        <li key={s.platform} className={cn("inline-flex items-center gap-1.5 font-mono text-xs tabular-nums", s.over ? "text-destructive" : "text-muted-foreground")}>
          <PlatformIcon platform={s.platform} className="size-3.5" label />
          <span>{t("countChars", { count: s.chars, max: s.maxChars })}</span>
          <span aria-hidden>·</span>
          <span>{s.maxHashtags == null ? t("countTagsNoMax", { count: s.hashtags }) : t("countTags", { count: s.hashtags, max: s.maxHashtags })}</span>
          {s.over && <span className="sr-only">{t("over")}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Huecos {tema} sin rellenar: un campo por hueco y «Rellenar». */
export function PlaceholderPanel({ names, onFill, disabled }: { names: string[]; onFill: (values: Record<string, string>) => void; disabled?: boolean }) {
  const t = useTranslations("templates.editor");
  const uid = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  if (!names.length) return null;
  return (
    <form
      className="space-y-3 rounded-md border border-warning/40 bg-warning/10 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onFill(values);
        setValues({});
      }}
    >
      <div>
        <p className="text-sm font-medium">{t("placeholdersTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("placeholdersBody")}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {names.map((n) => (
          <div key={n} className="space-y-1">
            <Label htmlFor={`${uid}-${n}`} className="font-mono text-xs">{`{${n}}`}</Label>
            <Input id={`${uid}-${n}`} value={values[n] ?? ""} maxLength={300} onChange={(e) => setValues((v) => ({ ...v, [n]: e.target.value }))} />
          </div>
        ))}
      </div>
      <Button type="submit" size="sm" variant="secondary" disabled={disabled || !Object.values(values).some((v) => v.trim())}>
        {t("fill")}
      </Button>
    </form>
  );
}
