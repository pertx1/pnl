"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CalendarCheck, Check, ImageUp, Send, Sparkles, Trash2, Undo2, X } from "lucide-react";
import { CreditCost } from "@/components/kreo/credit-cost";
import { toast } from "sonner";
import { AiBadge } from "@/components/kreo/ai-badge";
import { StatusBadge, type PostStatus } from "@/components/kreo/status-badge";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { duplicateCaptionWarning, TIKTOK_PRIVACY, YT_CATEGORIES, YT_LANGUAGES, ytTagsLength, type PlatformOptions, type RuleViolation } from "@/lib/posts/rules";
import type { EditorAccount, EditorAsset } from "@/lib/server/posts";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { addUploadedAsset, approvePost, deletePost, savePost, submitPost, unschedulePost, type PostActionResult } from "./actions";
import { aiCaptionVariations, aiSuggestCaptions } from "./ai-actions";
import { getYouTubePlaylists } from "./youtube-actions";

type Target = { socialAccountId: string; captionOverride: string; platformOptions: PlatformOptions };
type Initial = {
  postId?: string;
  title: string;
  caption: string;
  scheduledAt?: string | null;
  scheduledLocal: string;
  aiGenerated: boolean;
  assetIds: string[];
  targets: Target[];
  status: string;
};

const MEDIA_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov" };

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PostEditor({
  projectId,
  workspaceId,
  projectName,
  accounts,
  library: initialLibrary,
  canEdit,
  canApprove,
  initial,
}: {
  projectId: string;
  workspaceId: string;
  projectName: string;
  accounts: EditorAccount[];
  library: EditorAsset[];
  canEdit: boolean;
  canApprove: boolean;
  initial: Initial;
}) {
  const t = useTranslations("posts");
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);

  const [postId, setPostId] = useState(initial.postId);
  const [status, setStatus] = useState(initial.status);
  const [title, setTitle] = useState(initial.title);
  const [caption, setCaption] = useState(initial.caption);
  const [scheduled, setScheduled] = useState(initial.scheduledLocal);
  const [aiGenerated, setAiGenerated] = useState(initial.aiGenerated);
  const [assetIds, setAssetIds] = useState<string[]>(initial.assetIds);
  const [library, setLibrary] = useState(initialLibrary);
  const [targets, setTargets] = useState<Target[]>(initial.targets);
  const [errorKey, setErrorKey] = useState<string>();
  const [violations, setViolations] = useState<{ accountId: string; rules: RuleViolation[] }[]>([]);
  const [limits, setLimits] = useState<{ handle: string | null; planned: number; limit: number }[]>([]);
  const [aiPending, startAi] = useTransition();
  const [suggestions, setSuggestions] = useState<{ caption: string; hook: string }[]>([]);
  const [aiError, setAiError] = useState<string>();

  // La fecha guardada se muestra en la hora local del navegador (solo en cliente para evitar desajustes de zona).
  useEffect(() => {
    if (initial.scheduledAt) {
      const id = setTimeout(() => setScheduled(toLocalInput(initial.scheduledAt)), 0);
      return () => clearTimeout(id);
    }
  }, [initial.scheduledAt]);

  const selectedAssets = assetIds.map((id) => library.find((a) => a.id === id)).filter(Boolean) as EditorAsset[];
  const aiForced = selectedAssets.some((a) => a.ai);
  const locked = ["publishing", "published"].includes(status);
  const readOnly = !canEdit || locked;

  const duplicate = useMemo(
    () => duplicateCaptionWarning(targets.map((tg) => (tg.captionOverride.trim() ? tg.captionOverride : caption))),
    [targets, caption],
  );

  function toggleAccount(id: string, on: boolean) {
    setTargets((prev) => (on ? [...prev, { socialAccountId: id, captionOverride: "", platformOptions: {} }] : prev.filter((x) => x.socialAccountId !== id)));
  }
  function patchTarget(id: string, patch: Partial<Target>) {
    setTargets((prev) => prev.map((x) => (x.socialAccountId === id ? { ...x, ...patch } : x)));
  }
  function patchOptions(id: string, patch: Partial<PlatformOptions>) {
    setTargets((prev) => prev.map((x) => (x.socialAccountId === id ? { ...x, platformOptions: { ...x.platformOptions, ...patch } } : x)));
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    const ext = MEDIA_TYPES[file.type];
    if (!ext || file.size > 50 * 1024 * 1024) {
      toast.error(t("errorsX.invalid_input"));
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${workspaceId}/${projectId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("project-media").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const res = await addUploadedAsset(projectId, path, file.type, file.size);
      if (!res.ok || !("assetId" in res) || !res.assetId) throw new Error("asset");
      const { data } = await supabase.storage.from("project-media").createSignedUrl(path, 3600);
      setLibrary((prev) => [{ id: res.assetId!, url: data?.signedUrl ?? null, mime: file.type, ai: false }, ...prev]);
      setAssetIds((prev) => [...prev, res.assetId!]);
    } catch {
      toast.error(t("errorsX.generic"));
    } finally {
      setUploading(false);
    }
  }

  function handleResult(res: PostActionResult, okMsg: string) {
    if (res.ok) {
      setErrorKey(undefined);
      setViolations([]);
      setLimits([]);
      toast.success(okMsg);
      return true;
    }
    setErrorKey(res.error);
    setViolations(res.violations ?? []);
    setLimits(res.limits ?? []);
    return false;
  }

  async function doSave(): Promise<string | null> {
    const res = await savePost({
      projectId,
      postId,
      title,
      caption,
      scheduledAt: scheduled ? new Date(scheduled).toISOString() : null,
      aiGenerated: aiGenerated || aiForced,
      assetIds,
      targets: targets.map((x) => ({ socialAccountId: x.socialAccountId, captionOverride: x.captionOverride || null, platformOptions: x.platformOptions })),
    });
    if (!res.ok) {
      handleResult(res, "");
      return null;
    }
    if (res.postId && res.postId !== postId) {
      setPostId(res.postId);
      window.history.replaceState(null, "", `/app/p/${projectId}/posts/${res.postId}`);
    }
    return res.postId ?? postId ?? null;
  }

  const run = (fn: () => Promise<void>) => start(fn);

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-mono">{projectName}</p>
          <h1 className="text-[28px] leading-tight font-medium">{postId ? t("edit") : t("new")}</h1>
        </div>
        <div className="flex items-center gap-2">
          {(aiGenerated || aiForced) && <AiBadge />}
          <StatusBadge status={(["draft", "pending_approval", "scheduled", "published"].includes(status) ? status : status === "failed" ? "error" : status === "approved" ? "scheduled" : "draft") as PostStatus} />
        </div>
      </div>

      <p className="rounded-md border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">{t("approvalNote")}</p>

      <div className="grid gap-6 lg:grid-cols-5">
        <fieldset disabled={readOnly || pending} className="space-y-6 lg:col-span-3">
          <Card>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">{t("title")}</Label>
                <Input id="title" value={title} maxLength={120} placeholder={t("titlePlaceholder")} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="caption">{t("caption")}</Label>
                <Textarea id="caption" rows={6} value={caption} maxLength={5000} placeholder={t("captionPlaceholder")} onChange={(e) => setCaption(e.target.value)} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="brand"
                      size="sm"
                      disabled={aiPending || caption.trim().length < 3}
                      onClick={() =>
                        startAi(async () => {
                          setAiError(undefined);
                          const platform = accounts.find((a) => targets.some((x) => x.socialAccountId === a.id))?.platform ?? "instagram";
                          const res = await aiSuggestCaptions(projectId, caption, platform);
                          if (res.ok) setSuggestions(res.data);
                          else setAiError(res.error);
                        })
                      }
                    >
                      <Sparkles /> {aiPending ? t("suggesting") : t("suggest")}
                    </Button>
                    <CreditCost credits={1} />
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">{t("chars", { count: caption.length })}</p>
                </div>
                {aiError && <p className="text-xs text-destructive">{t.has(`aiErrors.${aiError}`) ? t(`aiErrors.${aiError}`) : t("errorsX.generic")}</p>}
                {suggestions.length > 0 && (
                  <div className="space-y-2 rounded-md border border-brand-amber/40 p-3">
                    <p className="text-xs text-muted-foreground">{t("aiReview")}</p>
                    {suggestions.map((s, i) => (
                      <div key={i} className="space-y-1 rounded-sm bg-secondary/60 p-2 text-sm">
                        <p className="whitespace-pre-line">{s.caption}</p>
                        <Button type="button" size="xs" variant="secondary" onClick={() => { setCaption(s.caption); setSuggestions([]); }}>
                          {t("useThis")}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("media")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedAssets.length === 0 && <p className="text-sm text-muted-foreground">{t("noMedia")}</p>}
              <div className="flex flex-wrap gap-2">
                {selectedAssets.map((a) => (
                  <div key={a.id} className="relative size-24 overflow-hidden rounded-md border bg-secondary">
                    {a.url && (a.mime.startsWith("video/") ? <video src={a.url} className="size-full object-cover" muted /> : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt="" className="size-full object-cover" />
                    ))}
                    {a.ai && <span className="absolute bottom-1 left-1 rounded-sm bg-brand-amber px-1 font-mono text-[9px] font-bold text-brand-amber-foreground">IA</span>}
                    <button type="button" aria-label="Quitar" onClick={() => setAssetIds((p) => p.filter((x) => x !== a.id))} className="absolute top-1 right-1 rounded-sm bg-background/80 p-0.5">
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
              <input ref={fileInput} type="file" className="sr-only" accept={Object.keys(MEDIA_TYPES).join(",")} onChange={(e) => upload(e.target.files?.[0])} aria-label={t("upload")} />
              <Button type="button" variant="secondary" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
                <ImageUp /> {uploading ? t("uploading") : t("upload")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("rightsNote")}</p>
              {library.filter((a) => !assetIds.includes(a.id)).length > 0 && (
                <div className="space-y-2">
                  <p className="label-mono">{t("library")}</p>
                  <div className="flex flex-wrap gap-2">
                    {library
                      .filter((a) => !assetIds.includes(a.id))
                      .slice(0, 12)
                      .map((a) => (
                        <button key={a.id} type="button" onClick={() => setAssetIds((p) => [...p, a.id])} className="size-14 overflow-hidden rounded-md border opacity-70 hover:opacity-100">
                          {a.url && !a.mime.startsWith("video/") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.url} alt="" className="size-full object-cover" />
                          ) : (
                            <span className="grid size-full place-items-center font-mono text-[10px]">VID</span>
                          )}
                        </button>
                      ))}
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2 border-t pt-3">
                <Switch id="ai" checked={aiGenerated || aiForced} disabled={aiForced} onCheckedChange={(v) => setAiGenerated(Boolean(v))} />
                <Label htmlFor="ai" className="block font-normal">
                  <span className="font-medium">{t("ai")}</span>
                  <span className="block text-xs text-muted-foreground">{aiForced ? t("aiForced") : t("aiHint")}</span>
                </Label>
              </div>
            </CardContent>
          </Card>
        </fieldset>

        <div className="space-y-6 lg:col-span-2">
          <fieldset disabled={readOnly || pending}>
            <Card>
              <CardHeader>
                <CardTitle>{t("accounts")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {accounts.length === 0 && (
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>{t("noAccounts")}</p>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/app/p/${projectId}/accounts`}>{t("connectAccounts")}</Link>
                    </Button>
                  </div>
                )}
                {accounts.map((acc) => {
                  const target = targets.find((x) => x.socialAccountId === acc.id);
                  const v = violations.find((x) => x.accountId === acc.id);
                  const handle = acc.handle ? `@${acc.handle.replace(/^@/, "")}` : acc.display_name ?? "";
                  return (
                    <div key={acc.id} className="space-y-3 rounded-md border p-3">
                      <label className="flex items-center gap-3">
                        <Checkbox checked={Boolean(target)} onCheckedChange={(on) => toggleAccount(acc.id, Boolean(on))} />
                        <PlatformIcon platform={acc.platform} className="size-7" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{handle}</span>
                      </label>
                      {target && (
                        <div className="space-y-3 border-t pt-3">
                          <div className="space-y-1">
                            <Label className="text-xs">{t("captionOverride")}</Label>
                            <Textarea rows={2} value={target.captionOverride} onChange={(e) => patchTarget(acc.id, { captionOverride: e.target.value })} placeholder={caption.slice(0, 80)} />
                            <p className="text-[11px] text-muted-foreground">{t("captionOverrideHint")}</p>
                          </div>
                          {acc.platform === "tiktok" && <TikTokOptions handle={handle} options={target.platformOptions} onChange={(p) => patchOptions(acc.id, p)} />}
                          {acc.platform === "youtube" && (
                            <YouTubeOptions
                              projectId={projectId}
                              accountId={acc.id}
                              images={library.filter((a) => a.mime === "image/jpeg" || a.mime === "image/png")}
                              options={target.platformOptions}
                              onChange={(p) => patchOptions(acc.id, p)}
                            />
                          )}
                          {v && (
                            <ul className="space-y-1 text-xs text-destructive">
                              {v.rules.map((r) => (
                                <li key={r}>• {t(`rules.${r}`)}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {duplicate && (
                  <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
                    <p className="flex gap-2">
                      <AlertTriangle className="size-4 shrink-0" aria-hidden /> {t("duplicateWarning")}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="xs"
                        variant="brand"
                        disabled={aiPending}
                        onClick={() =>
                          startAi(async () => {
                            setAiError(undefined);
                            const accs = targets.map((x) => ({ key: x.socialAccountId, platform: accounts.find((a) => a.id === x.socialAccountId)?.platform ?? "" }));
                            const res = await aiCaptionVariations(projectId, caption, accs);
                            if (!res.ok) return setAiError(res.error);
                            for (const v of res.data) patchTarget(v.accountKey, { captionOverride: v.caption });
                          })
                        }
                      >
                        <Sparkles /> {t("variations")}
                      </Button>
                      <CreditCost credits={1} className="text-warning" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </fieldset>

          <Card>
            <CardContent className="space-y-4">
              <fieldset disabled={readOnly || pending} className="space-y-2">
                <Label htmlFor="schedule">{t("schedule")}</Label>
                <Input id="schedule" type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
                <p className="text-xs text-muted-foreground">{t("scheduleHint")}</p>
              </fieldset>

              {errorKey && (
                <div role="alert" className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <p>{t.has(`errorsX.${errorKey}`) ? t(`errorsX.${errorKey}`) : t("errorsX.generic")}</p>
                  {limits.map((l, i) => (
                    <p key={i} className="font-mono text-xs">
                      {t("limitLine", { handle: l.handle ?? "—", planned: l.planned, limit: l.limit })}
                    </p>
                  ))}
                </div>
              )}

              {!readOnly && (
                <div className="flex flex-col gap-2">
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        const id = await doSave();
                        if (id) {
                          toast.success(t("saved"));
                          setStatus((s) => (s === "scheduled" || s === "approved" ? "pending_approval" : s));
                          router.refresh();
                        }
                      })
                    }
                  >
                    {t("saveDraft")}
                  </Button>
                  {status === "draft" && !canApprove && (
                    <Button
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          const id = await doSave();
                          if (!id) return;
                          if (handleResult(await submitPost(projectId, id), t("submitted"))) setStatus("pending_approval");
                        })
                      }
                    >
                      <Send /> {t("submit")}
                    </Button>
                  )}
                  {canApprove && ["draft", "pending_approval"].includes(status) && (
                    <Button
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          const id = await doSave();
                          if (!id) return;
                          const res = await approvePost(projectId, id);
                          if (handleResult(res, t("approved")) && res.ok) {
                            setStatus(res.status ?? "scheduled");
                            router.push(`/app/p/${projectId}/calendar`);
                          }
                        })
                      }
                    >
                      {scheduled ? <CalendarCheck /> : <Check />} {scheduled ? t("approve") : t("approveNow")}
                    </Button>
                  )}
                  {postId && ["approved", "scheduled", "pending_approval", "failed"].includes(status) && (
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          if (handleResult(await unschedulePost(projectId, postId), t("saved"))) setStatus("draft");
                        })
                      }
                    >
                      <Undo2 /> {t("unschedule")}
                    </Button>
                  )}
                  {postId && ["draft", "pending_approval", "cancelled", "failed"].includes(status) && (
                    <Button
                      variant="destructive"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          if (handleResult(await deletePost(projectId, postId), t("deleted"))) router.push(`/app/p/${projectId}/calendar`);
                        })
                      }
                    >
                      <Trash2 /> {t("delete")}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Opciones de TikTok según sus Content Sharing Guidelines (privacidad sin valor por defecto, divulgación comercial). */
function TikTokOptions({ handle, options, onChange }: { handle: string; options: PlatformOptions; onChange: (p: Partial<PlatformOptions>) => void }) {
  const t = useTranslations("posts.tiktok");
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">{t("postingAs", { handle })}</p>
      <div className="space-y-1">
        <Label className="text-xs">{t("privacy")}</Label>
        <select
          className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm"
          value={options.privacy_level ?? ""}
          onChange={(e) => onChange({ privacy_level: (e.target.value || undefined) as PlatformOptions["privacy_level"] })}
        >
          <option value="">{t("privacyPlaceholder")}</option>
          {TIKTOK_PRIVACY.map((p) => (
            <option key={p} value={p} disabled={p === "SELF_ONLY" && options.brand_content_toggle}>
              {t(p)}
            </option>
          ))}
        </select>
      </div>
      {(
        [
          ["disable_comment", "allowComments"],
          ["disable_duet", "allowDuet"],
          ["disable_stitch", "allowStitch"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="flex items-center justify-between gap-2">
          <span>{t(label)}</span>
          {/* TikTok Content Sharing Guidelines: ninguna interacción activada por defecto (el usuario la activa). */}
          <Switch checked={options[key] === false} onCheckedChange={(v) => onChange({ [key]: !v })} />
        </label>
      ))}
      <div className="space-y-2 rounded-md bg-secondary/60 p-2">
        <p className="label-mono">{t("commercial")}</p>
        <label className="flex items-start gap-2">
          <Checkbox checked={Boolean(options.brand_organic_toggle)} onCheckedChange={(v) => onChange({ brand_organic_toggle: Boolean(v) })} className="mt-0.5" />
          <span>
            {t("yourBrand")}
            <span className="block text-[11px] text-muted-foreground">{t("yourBrandHint")}</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <Checkbox checked={Boolean(options.brand_content_toggle)} onCheckedChange={(v) => onChange({ brand_content_toggle: Boolean(v) })} className="mt-0.5" />
          <span>
            {t("branded")}
            <span className="block text-[11px] text-muted-foreground">{t("brandedHint")}</span>
          </span>
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">{options.brand_content_toggle ? t("musicBranded") : t("music")}</p>
      <p className="text-[11px] text-warning">{t("unaudited")}</p>
    </div>
  );
}

function YouTubeOptions({
  projectId,
  accountId,
  images,
  options,
  onChange,
}: {
  projectId: string;
  accountId: string;
  images: EditorAsset[];
  options: PlatformOptions;
  onChange: (p: Partial<PlatformOptions>) => void;
}) {
  const t = useTranslations("posts.youtube");
  const [tagsText, setTagsText] = useState((options.yt_tags ?? []).join(", "));
  const [playlists, setPlaylists] = useState<{ id: string; title: string }[] | null>(null);
  const [plError, setPlError] = useState<string>();
  const [loadingPl, startPl] = useTransition();
  const tagsLen = ytTagsLength(options.yt_tags);
  const selectCls = "w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm";

  function loadPlaylists() {
    startPl(async () => {
      const res = await getYouTubePlaylists(projectId, accountId);
      if (res.ok) {
        setPlaylists(res.playlists);
        setPlError(undefined);
      } else setPlError(res.error);
    });
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        <Label className="text-xs">{t("title")}</Label>
        <Input value={options.yt_title ?? ""} maxLength={100} onChange={(e) => onChange({ yt_title: e.target.value })} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">{t("privacy")}</Label>
          <select className={selectCls} value={options.yt_privacy ?? "private"} onChange={(e) => onChange({ yt_privacy: e.target.value as PlatformOptions["yt_privacy"] })}>
            <option value="public">{t("public")}</option>
            <option value="unlisted">{t("unlisted")}</option>
            <option value="private">{t("private")}</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("category")}</Label>
          <select className={selectCls} value={options.yt_category_id ?? "22"} onChange={(e) => onChange({ yt_category_id: e.target.value as PlatformOptions["yt_category_id"] })}>
            {YT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {options.yt_privacy === "public" && <p className="text-[11px] text-warning">{t("unauditedPrivate")}</p>}

      <div className="space-y-1">
        <Label className="text-xs">{t("tags")}</Label>
        <Input
          value={tagsText}
          placeholder={t("tagsPlaceholder")}
          onChange={(e) => {
            setTagsText(e.target.value);
            const tags = e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 40);
            onChange({ yt_tags: tags.length ? tags : undefined });
          }}
        />
        <p className={cn("text-[11px]", tagsLen > 500 ? "text-destructive" : "text-muted-foreground")}>{t("tagsHint", { n: tagsLen })}</p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("thumbnail")}</Label>
        {images.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">{t("thumbnailEmpty")}</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => onChange({ yt_thumbnail_asset_id: undefined })}
              aria-pressed={!options.yt_thumbnail_asset_id}
              className={cn("grid h-12 w-20 shrink-0 place-items-center rounded-md border text-[11px]", !options.yt_thumbnail_asset_id ? "border-selected" : "text-muted-foreground")}
            >
              {t("thumbnailAuto")}
            </button>
            {images.slice(0, 24).map((img) => (
              <button
                type="button"
                key={img.id}
                onClick={() => onChange({ yt_thumbnail_asset_id: img.id })}
                aria-pressed={options.yt_thumbnail_asset_id === img.id}
                aria-label={t("thumbnailPick")}
                className={cn("h-12 w-20 shrink-0 overflow-hidden rounded-md border-2", options.yt_thumbnail_asset_id === img.id ? "border-selected" : "border-transparent opacity-70 hover:opacity-100")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {img.url && <img src={img.url} alt="" className="size-full object-cover" />}
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">{t("thumbnailHint")}</p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("playlist")}</Label>
        {playlists === null ? (
          <Button type="button" size="sm" variant="outline" onClick={loadPlaylists} disabled={loadingPl}>
            {loadingPl ? t("playlistLoading") : t("playlistLoad")}
          </Button>
        ) : (
          <select className={selectCls} value={options.yt_playlist_id ?? ""} onChange={(e) => onChange({ yt_playlist_id: e.target.value || undefined })}>
            <option value="">{t("playlistNone")}</option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        )}
        {plError && <p className="text-[11px] text-destructive">{plError === "reconnect" ? t("playlistReconnect") : t("playlistError")}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">{t("language")}</Label>
          <select className={selectCls} value={options.yt_language ?? ""} onChange={(e) => onChange({ yt_language: (e.target.value || undefined) as PlatformOptions["yt_language"] })}>
            <option value="">{t("languageNone")}</option>
            {YT_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {t(`languages.${l}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("license")}</Label>
          <select className={selectCls} value={options.yt_license ?? "youtube"} onChange={(e) => onChange({ yt_license: e.target.value as PlatformOptions["yt_license"] })}>
            <option value="youtube">{t("licenseYoutube")}</option>
            <option value="creativeCommon">{t("licenseCc")}</option>
          </select>
        </div>
      </div>

      <label className="flex items-center justify-between gap-2">
        <span>{t("madeForKids")}</span>
        <Switch checked={Boolean(options.yt_made_for_kids)} onCheckedChange={(v) => onChange({ yt_made_for_kids: Boolean(v) })} />
      </label>
      <label className="flex items-center justify-between gap-2">
        <span>{t("notify")}</span>
        <Switch checked={options.yt_notify_subscribers !== false} onCheckedChange={(v) => onChange({ yt_notify_subscribers: Boolean(v) })} />
      </label>
      <label className="flex items-center justify-between gap-2">
        <span>{t("embeddable")}</span>
        <Switch checked={options.yt_embeddable !== false} onCheckedChange={(v) => onChange({ yt_embeddable: Boolean(v) })} />
      </label>
      <p className="text-[11px] text-muted-foreground">{t("shortsHint")}</p>
    </div>
  );
}
