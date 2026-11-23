"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { countHashtags } from "@/lib/posts/rules";
import { extractPlaceholders, parseHashtags } from "@/lib/posts/templates";
import type { EditorAccount } from "@/lib/server/posts";
import type { SnippetDTO, TemplateDTO } from "@/lib/server/templates";
import { saveSnippet, saveTemplate } from "./actions";

export const handleOf = (a: Pick<EditorAccount, "handle" | "display_name" | "platform">) => (a.handle ? `@${a.handle.replace(/^@/, "")}` : (a.display_name ?? a.platform));

/** Crear o editar una plantilla (las opciones de YouTube se conservan; se cambian guardando desde el editor). */
export function TemplateFormDialog({ projectId, accounts, template, onClose }: { projectId: string; accounts: EditorAccount[]; template?: TemplateDTO; onClose: () => void }) {
  const t = useTranslations("templates.form");
  const te = useTranslations("templates.errors");
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState(template?.name ?? "");
  const [title, setTitle] = useState(template?.title ?? "");
  const [caption, setCaption] = useState(template?.caption ?? "");
  const [hashtags, setHashtags] = useState((template?.hashtags ?? []).join(" "));
  const [accountIds, setAccountIds] = useState<string[]>(template?.accountIds.filter((id) => accounts.some((a) => a.id === id)) ?? []);
  const [time, setTime] = useState(template?.preferredTime ?? "");
  const [pending, start] = useTransition();
  const tags = parseHashtags(hashtags);
  const holes = extractPlaceholders(title, caption);
  const ytOptions = Object.keys(template?.options.youtube ?? {}).length;

  function save() {
    start(async () => {
      const res = await saveTemplate({
        projectId,
        templateId: template?.id,
        name,
        title,
        caption,
        hashtags: tags,
        accountIds,
        options: { youtube: template?.options.youtube },
        preferredTime: time || null,
      });
      if (!res.ok) {
        toast.error(te.has(res.error) ? te(res.error) : te("generic"));
        return;
      }
      toast.success(t("saved"));
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] grid-rows-[auto_1fr] overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{template ? t("titleEdit") : t("titleNew")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form
          className="min-h-0 space-y-4 overflow-y-auto pr-1"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`${uid}-name`}>{t("name")}</Label>
            <Input id={`${uid}-name`} value={name} required maxLength={80} placeholder={t("namePlaceholder")} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${uid}-title`}>{t("postTitle")}</Label>
            <Input id={`${uid}-title`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${uid}-caption`}>{t("caption")}</Label>
            <Textarea id={`${uid}-caption`} rows={5} value={caption} maxLength={5000} placeholder={t("captionPlaceholder")} aria-describedby={`${uid}-caption-hint`} onChange={(e) => setCaption(e.target.value)} />
            <p id={`${uid}-caption-hint`} className="text-xs text-muted-foreground">
              {t("captionHint")}
            </p>
            {holes.length > 0 && (
              <p className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                {t("holes")}
                {holes.map((h) => (
                  <code key={h} className="rounded-sm bg-secondary px-1 font-mono">{`{${h}}`}</code>
                ))}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${uid}-tags`}>{t("hashtags")}</Label>
            <Input id={`${uid}-tags`} value={hashtags} placeholder="#cafe #barista" aria-describedby={`${uid}-tags-hint`} onChange={(e) => setHashtags(e.target.value)} />
            <p id={`${uid}-tags-hint`} className="text-xs text-muted-foreground">
              {t("hashtagsHint")} <span className="font-mono tabular-nums">{t("hashtagCount", { count: tags.length })}</span>
            </p>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("accounts")}</legend>
            {accounts.length === 0 && <p className="text-xs text-muted-foreground">{t("noAccounts")}</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              {accounts.map((a) => (
                <label key={a.id} className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm">
                  <Checkbox checked={accountIds.includes(a.id)} onCheckedChange={(on) => setAccountIds((p) => (on ? [...p, a.id] : p.filter((x) => x !== a.id)))} />
                  <PlatformIcon platform={a.platform} className="size-5" label />
                  <span className="truncate">{handleOf(a)}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("tiktokNote")}</p>
            {ytOptions > 0 && <p className="text-xs text-muted-foreground">{t("youtubeNote", { count: ytOptions })}</p>}
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor={`${uid}-time`}>{t("time")}</Label>
            <Input id={`${uid}-time`} type="time" value={time} className="w-36 font-mono tabular-nums" aria-describedby={`${uid}-time-hint`} onChange={(e) => setTime(e.target.value)} />
            <p id={`${uid}-time-hint`} className="text-xs text-muted-foreground">
              {t("timeHint")}
            </p>
          </div>
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

/** Crear o editar un grupo de hashtags o un texto guardado. */
export function SnippetDialog({ projectId, kind, snippet, onClose }: { projectId: string; kind: "hashtags" | "text"; snippet?: SnippetDTO; onClose: () => void }) {
  const t = useTranslations("templates.snippets");
  const te = useTranslations("templates.errors");
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState(snippet?.name ?? "");
  const [content, setContent] = useState(snippet?.content ?? "");
  const [pending, start] = useTransition();
  const tags = kind === "hashtags" ? parseHashtags(content) : [];

  function save() {
    start(async () => {
      const res = await saveSnippet({ projectId, snippetId: snippet?.id, kind, name, content });
      if (!res.ok) {
        toast.error(te.has(res.error) ? te(res.error) : te("generic"));
        return;
      }
      toast.success(t("saved"));
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{snippet ? t("dialogEdit") : kind === "hashtags" ? t("dialogNewHashtags") : t("dialogNewText")}</DialogTitle>
          <DialogDescription>{kind === "hashtags" ? t("dialogHashtagsBody") : t("dialogTextBody")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`${uid}-name`}>{t("name")}</Label>
            <Input
              id={`${uid}-name`}
              value={name}
              required
              maxLength={80}
              placeholder={kind === "hashtags" ? t("namePlaceholderHashtags") : t("namePlaceholderText")}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${uid}-content`}>{t("content")}</Label>
            <Textarea
              id={`${uid}-content`}
              rows={4}
              value={content}
              required
              maxLength={2200}
              placeholder={kind === "hashtags" ? "#cafe #barista #specialtycoffee" : t("contentPlaceholderText")}
              aria-describedby={`${uid}-content-hint`}
              onChange={(e) => setContent(e.target.value)}
            />
            <p id={`${uid}-content-hint`} className="font-mono text-xs text-muted-foreground tabular-nums">
              {kind === "hashtags" ? t("hashtagCount", { count: tags.length }) : t("stats", { chars: content.length, tags: countHashtags(content) })}
            </p>
            {kind === "hashtags" && tags.length > 30 && <p className="text-xs text-warning">{t("overInstagram")}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !name.trim() || !content.trim() || (kind === "hashtags" && !tags.length)}>
              {pending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
