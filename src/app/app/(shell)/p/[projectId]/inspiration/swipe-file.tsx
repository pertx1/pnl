"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Bookmark, ExternalLink, Loader2, Pencil, Plus, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { CreditCost } from "@/components/kreo/credit-cost";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useResearchError, YouTubeAttribution } from "../competitors/_components/shared";
import { addSwipe, deleteSwipe, remixSwipe, updateSwipe } from "./actions";

export type SwipeView = {
  id: string;
  url: string;
  network: "youtube" | "tiktok" | "instagram" | "facebook" | "other";
  kind: "video" | "ad" | "post";
  title: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  notes: string;
  tags: string[];
};

const KINDS = ["video", "ad", "post"] as const;
const selectCls = "w-full rounded-md border border-input bg-transparent px-2 py-2 text-sm";
/** Longitud máxima del borrador en la URL del editor. */
const MAX_CAPTION_IN_URL = 1500;

export function SwipeFile({
  projectId,
  swipes,
  allTags,
  filters,
  canEdit,
  aiEnabled,
  remixCredits,
  balance,
}: {
  projectId: string;
  swipes: SwipeView[];
  allTags: string[];
  filters: { tag?: string; kind?: string; network?: string };
  canEdit: boolean;
  aiEnabled: boolean;
  remixCredits: number;
  balance: number;
}) {
  const t = useTranslations("inspiration.swipe");
  const errorText = useResearchError();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("video");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [busy, start] = useTransition();
  const base = `/app/p/${projectId}/inspiration`;

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { ...filters, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const chip = (on: boolean) => cn("rounded-full border px-3 py-1 text-xs", on ? "border-selected bg-primary/10 font-semibold" : "hover:bg-accent");
  const hasYouTube = swipes.some((s) => s.network === "youtube");

  return (
    <div className="space-y-5">
      {canEdit && (
        <form
          className="space-y-3 rounded-xl border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await addSwipe({ projectId, url, kind, notes, tags });
              if (r.ok) {
                setUrl("");
                setNotes("");
                setTags("");
                toast.success(t("added"));
              } else toast.error(errorText(r.error));
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <div className="space-y-1">
              <Label htmlFor="swipe-url">{t("url")}</Label>
              <Input id="swipe-url" type="url" inputMode="url" placeholder="https://" value={url} maxLength={2000} onChange={(e) => setUrl(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="swipe-kind">{t("kind")}</Label>
              <select id="swipe-kind" className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kinds.${k}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="swipe-notes">{t("notes")}</Label>
              <Textarea id="swipe-notes" rows={2} maxLength={5000} placeholder={t("notesPlaceholder")} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="swipe-tags">{t("tags")}</Label>
              <Input id="swipe-tags" placeholder={t("tagsPlaceholder")} value={tags} maxLength={1000} onChange={(e) => setTags(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t("legal")}</p>
            <Button type="submit" disabled={busy || url.trim().length < 8}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} {t("add")}
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("filterNetwork")}>
          <Link href={href({ network: undefined })} className={chip(!filters.network)}>
            {t("allNetworks")}
          </Link>
          {(["youtube", "tiktok", "instagram", "facebook", "other"] as const).map((n) => (
            <Link key={n} href={href({ network: n })} className={chip(filters.network === n)} aria-current={filters.network === n ? "true" : undefined}>
              {t(`networks.${n}`)}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("filterKind")}>
          <Link href={href({ kind: undefined })} className={chip(!filters.kind)}>
            {t("allKinds")}
          </Link>
          {KINDS.map((k) => (
            <Link key={k} href={href({ kind: k })} className={chip(filters.kind === k)} aria-current={filters.kind === k ? "true" : undefined}>
              {t(`kinds.${k}`)}
            </Link>
          ))}
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("filterTag")}>
            {filters.tag && (
              <Link href={href({ tag: undefined })} className={cn(chip(false), "inline-flex items-center gap-1")}>
                <X className="size-3" aria-hidden /> {t("clearTag")}
              </Link>
            )}
            {allTags.map((tag) => (
              <Link key={tag} href={href({ tag })} className={chip(filters.tag === tag)} aria-current={filters.tag === tag ? "true" : undefined}>
                #{tag}
              </Link>
            ))}
          </div>
        )}
      </div>

      {swipes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
          <Bookmark className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          <p className="font-medium">{t("empty.title")}</p>
          <p className="max-w-md text-sm text-muted-foreground">{t("empty.body")}</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {swipes.map((s) => (
            <SwipeCard
              key={s.id}
              s={s}
              projectId={projectId}
              canEdit={canEdit}
              aiEnabled={aiEnabled}
              remixCredits={remixCredits}
              balance={balance}
              onRemix={(caption) => router.push(`/app/p/${projectId}/posts/new?caption=${encodeURIComponent(caption.slice(0, MAX_CAPTION_IN_URL))}`)}
              errorText={errorText}
            />
          ))}
        </ul>
      )}
      {hasYouTube && <YouTubeAttribution />}
    </div>
  );
}

function SwipeCard({
  s,
  canEdit,
  aiEnabled,
  remixCredits,
  balance,
  onRemix,
  errorText,
}: {
  s: SwipeView;
  projectId: string;
  canEdit: boolean;
  aiEnabled: boolean;
  remixCredits: number;
  balance: number;
  onRemix: (caption: string) => void;
  errorText: (c?: string) => string;
}) {
  const t = useTranslations("inspiration.swipe");
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(s.notes);
  const [tags, setTags] = useState(s.tags.join(", "));
  const [kind, setKind] = useState(s.kind);
  const [busy, start] = useTransition();
  const canAi = aiEnabled && balance >= remixCredits;

  function remix(useAi: boolean) {
    start(async () => {
      const r = await remixSwipe(s.id, useAi);
      if (!r.ok) return void toast.error(errorText(r.error));
      if (!r.caption.trim()) return void toast.error(t("remixEmpty"));
      onRemix(r.caption);
    });
  }

  return (
    <li className="flex flex-col overflow-hidden rounded-xl border bg-card">
      {s.thumbnailUrl ? (
        <a href={s.url} target="_blank" rel="noopener noreferrer" className="block bg-secondary" aria-label={t("open")}>
          {/* Miniatura servida por la propia plataforma vía oEmbed (no la descargamos ni la guardamos). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.thumbnailUrl} alt="" className="aspect-video w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
        </a>
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start gap-2">
          {s.network === "other" || s.network === "facebook" ? (
            <span className="label-mono !text-[9px]">{t(`networks.${s.network}`)}</span>
          ) : (
            <PlatformIcon platform={s.network} className="size-5 text-[8px]" />
          )}
          <span className="label-mono !text-[9px]">{t(`kinds.${s.kind}`)}</span>
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-muted-foreground hover:text-foreground" aria-label={t("open")}>
            <ExternalLink className="size-4" />
          </a>
        </div>
        <p className="line-clamp-2 text-sm font-medium break-words">{s.title ?? s.url}</p>
        {s.authorName && <p className="text-xs text-muted-foreground">{s.authorName}</p>}

        {editing ? (
          <div className="space-y-2">
            <Textarea aria-label={t("notes")} rows={3} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Input aria-label={t("tags")} value={tags} maxLength={1000} onChange={(e) => setTags(e.target.value)} />
            <select aria-label={t("kind")} className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kinds.${k}`)}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button
                size="xs"
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    const r = await updateSwipe({ swipeId: s.id, notes, tags, kind });
                    if (r.ok) setEditing(false);
                    else toast.error(errorText(r.error));
                  })
                }
              >
                {t("save")}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {s.notes && <p className="line-clamp-4 text-sm whitespace-pre-line text-muted-foreground">{s.notes}</p>}
            {s.tags.length > 0 && (
              <p className="flex flex-wrap gap-1">
                {s.tags.map((tag) => (
                  <span key={tag} className="rounded-sm bg-secondary px-1.5 py-px font-mono text-[11px]">
                    #{tag}
                  </span>
                ))}
              </p>
            )}
          </>
        )}

        {canEdit && !editing && (
          <div className="mt-auto space-y-2 border-t pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="xs" variant="brand" disabled={busy || !canAi} onClick={() => remix(true)}>
                {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {t("remix")}
              </Button>
              <CreditCost credits={remixCredits} />
            </div>
            <div className="flex flex-wrap gap-1">
              <Button size="xs" variant="outline" disabled={busy} onClick={() => remix(false)} title={t("remixNoAiHint")}>
                <Wand2 /> {t("remixNoAi")}
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label={t("edit")} onClick={() => setEditing(true)}>
                <Pencil />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={t("delete")}
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(t("deleteConfirm"))) return;
                  start(async () => {
                    const r = await deleteSwipe(s.id);
                    if (!r.ok) toast.error(errorText(r.error));
                  });
                }}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
