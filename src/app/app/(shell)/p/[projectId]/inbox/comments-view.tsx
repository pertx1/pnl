"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CheckCheck, Clapperboard, ExternalLink, Eye, EyeOff, ImageIcon, Info, MessageCircle, Reply, Send, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { CreditCost } from "@/components/kreo/credit-cost";
import { EmptyState } from "@/components/kreo/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COMMENT_MAX_LENGTH } from "@/lib/inbox/comments";
import { cn } from "@/lib/utils";
import { markCommentRead, markMediaCommentsRead, replyToCommentAction, setCommentHiddenAction, suggestCommentReplyAction } from "./comment-actions";

export type CommentItem = {
  id: string;
  username: string | null;
  isOwn: boolean;
  body: string;
  commentedAt: string;
  hidden: boolean;
  unread: boolean;
  repliedAt: string | null;
  aiAssisted: boolean;
  viaKreo: boolean;
};
export type CommentThread = { top: CommentItem; replies: CommentItem[] };
export type MediaGroup = {
  id: string;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  isVideo: boolean;
  postedAt: string | null;
  connectionLabel: string;
  connectionActive: boolean;
  threads: CommentThread[];
};

const FILTERS = ["all", "unread", "pending"] as const;
type Filter = (typeof FILTERS)[number];
const REPLY_CREDITS = 1;

const isPending = (th: CommentThread) => !th.top.isOwn && !th.top.hidden && !th.top.repliedAt;
const threadUnread = (th: CommentThread) => th.top.unread || th.replies.some((r) => r.unread);

/** Comentarios de Instagram agrupados por publicación. Responder, ocultar y marcar como leído: siempre con un clic humano. */
export function CommentsView({ groups, canEdit, balance, agentsConfigured }: { groups: MediaGroup[]; canEdit: boolean; balance: number; agentsConfigured: boolean }) {
  const t = useTranslations("inbox.comments");
  const [filter, setFilter] = useState<Filter>("all");
  const counts = {
    all: groups.reduce((n, g) => n + g.threads.length, 0),
    unread: groups.reduce((n, g) => n + g.threads.filter(threadUnread).length, 0),
    pending: groups.reduce((n, g) => n + g.threads.filter(isPending).length, 0),
  };
  const visible = groups
    .map((g) => ({ ...g, threads: g.threads.filter((th) => (filter === "unread" ? threadUnread(th) : filter === "pending" ? isPending(th) : true)) }))
    .filter((g) => g.threads.length > 0);

  return (
    <section aria-label={t("label")} className="space-y-4">
      <nav aria-label={t("filtersLabel")} className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
              filter === f ? "border-selected bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`filters.${f}`)}
            {counts[f] > 0 && <span className="font-mono tabular-nums">{counts[f]}</span>}
          </button>
        ))}
      </nav>

      {visible.length === 0 ? (
        <EmptyState icon={MessageCircle} title={t(`empty.${filter}`)} body={t("empty.hint")} compact />
      ) : (
        <div className="space-y-4">
          {visible.map((g) => (
            <MediaCard key={g.id} group={g} canEdit={canEdit} balance={balance} agentsConfigured={agentsConfigured} />
          ))}
        </div>
      )}
    </section>
  );
}

function MediaCard({ group, canEdit, balance, agentsConfigured }: { group: MediaGroup; canEdit: boolean; balance: number; agentsConfigured: boolean }) {
  const t = useTranslations("inbox.comments");
  const tInbox = useTranslations("inbox");
  const format = useFormatter();
  const router = useRouter();
  const [busy, start] = useTransition();
  const unread = group.threads.reduce((n, th) => n + (th.top.unread ? 1 : 0) + th.replies.filter((r) => r.unread).length, 0);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-start gap-3 border-b px-4 py-3">
        <div aria-hidden className="relative aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
          {group.thumbnailUrl ? (
            // URL temporal del CDN de Instagram (se renueva al sincronizar). Sin referer hacia Meta.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={group.thumbnailUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-muted-foreground">
              {group.isVideo ? <Clapperboard className="size-5" strokeWidth={1.5} /> : <ImageIcon className="size-5" strokeWidth={1.5} />}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="line-clamp-2 text-sm font-medium">{group.caption ?? t("noCaption")}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            <span>{tInbox("via", { account: group.connectionLabel })}</span>
            {group.postedAt && (
              <time dateTime={group.postedAt} className="font-mono tabular-nums">
                {format.dateTime(new Date(group.postedAt), { dateStyle: "medium" })}
              </time>
            )}
            {group.permalink && (
              <a href={group.permalink} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">
                {t("openPost")} <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </p>
        </div>
        {canEdit && unread > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full"
            disabled={busy}
            onClick={() =>
              start(async () => {
                const res = await markMediaCommentsRead(group.id);
                if (!res.ok) toast.error(tInbox("errors.default"));
                router.refresh();
              })
            }
          >
            <CheckCheck aria-hidden /> {t("markPostRead", { count: unread })}
          </Button>
        )}
      </CardHeader>
      <CardContent className="divide-y px-0">
        {group.threads.map((th) => (
          <ThreadBlock key={th.top.id} thread={th} canEdit={canEdit} connectionActive={group.connectionActive} balance={balance} agentsConfigured={agentsConfigured} />
        ))}
      </CardContent>
    </Card>
  );
}

function ThreadBlock({ thread, canEdit, connectionActive, balance, agentsConfigured }: { thread: CommentThread; canEdit: boolean; connectionActive: boolean; balance: number; agentsConfigured: boolean }) {
  const [replying, setReplying] = useState(false);
  const canReply = canEdit && connectionActive && !thread.top.isOwn && !thread.top.hidden;
  return (
    <div className="space-y-2 px-4 py-3">
      <CommentRow c={thread.top} canEdit={canEdit && connectionActive} onReply={canReply ? () => setReplying((v) => !v) : undefined} />
      {thread.replies.length > 0 && (
        <ul className="ml-6 space-y-2 border-l pl-3">
          {thread.replies.map((r) => (
            <li key={r.id}>
              <CommentRow c={r} canEdit={canEdit && connectionActive} />
            </li>
          ))}
        </ul>
      )}
      {replying && canReply && <ReplyComposer comment={thread.top} balance={balance} agentsConfigured={agentsConfigured} onDone={() => setReplying(false)} />}
    </div>
  );
}

function CommentRow({ c, canEdit, onReply }: { c: CommentItem; canEdit: boolean; onReply?: () => void }) {
  const t = useTranslations("inbox.comments");
  const tInbox = useTranslations("inbox");
  const format = useFormatter();
  const router = useRouter();
  const [busy, start] = useTransition();
  const errText = (code: string) => (tInbox.has(`errors.${code}`) ? tInbox(`errors.${code}`) : tInbox("errors.default"));
  const act = (fn: () => Promise<{ ok?: boolean; error?: string }>, okMsg?: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(errText(res.error ?? "default"));
      else if (okMsg) toast.success(okMsg);
      router.refresh();
    });

  return (
    <article className={cn("rounded-xl px-3 py-2", c.isOwn ? "bg-primary/5" : "bg-secondary", c.hidden && "opacity-70")}>
      <p className="mb-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
        {c.unread && <span aria-hidden className="size-1.5 rounded-full bg-primary" />}
        <span className={cn("text-foreground/80", c.unread ? "font-semibold" : "font-medium")}>
          {c.isOwn ? tInbox("you") : c.username ? `@${c.username}` : tInbox("unknownSender")}
        </span>
        <time dateTime={c.commentedAt} className="font-mono tabular-nums">
          {format.relativeTime(new Date(c.commentedAt))}
        </time>
        {c.unread && <span className="sr-only">{tInbox("tags.unread")}</span>}
        {c.hidden && <span className="rounded-full border px-1.5 py-px text-[10px]">{t("hiddenTag")}</span>}
        {c.repliedAt && !c.isOwn && <span className="rounded-full border border-success/40 px-1.5 py-px text-[10px] text-success">{tInbox("tags.replied")}</span>}
        {c.viaKreo && <span>· {tInbox("sentFromKreo")}</span>}
        {c.aiAssisted && <span>· {tInbox("aiAssisted")}</span>}
      </p>
      {/* Texto plano: nunca se interpreta HTML del comentario. */}
      <p className="text-sm break-words whitespace-pre-wrap">{c.body || "—"}</p>
      {canEdit && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {onReply && (
            <Button variant="ghost" size="xs" className="rounded-full" onClick={onReply}>
              <Reply aria-hidden /> {t("reply")}
            </Button>
          )}
          {!c.isOwn && (
            <Button variant="ghost" size="xs" className="rounded-full" disabled={busy} onClick={() => act(() => setCommentHiddenAction(c.id, !c.hidden), c.hidden ? t("shown") : t("hidden"))}>
              {c.hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />} {c.hidden ? t("show") : t("hide")}
            </Button>
          )}
          {!c.isOwn && (
            <Button variant="ghost" size="xs" className="rounded-full" disabled={busy} onClick={() => act(() => markCommentRead(c.id, !c.unread))}>
              {c.unread ? t("markRead") : t("markUnread")}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

function ReplyComposer({ comment, balance, agentsConfigured, onDone }: { comment: CommentItem; balance: number; agentsConfigured: boolean; onDone: () => void }) {
  const t = useTranslations("inbox.comments");
  const tInbox = useTranslations("inbox");
  const router = useRouter();
  const [body, setBody] = useState("");
  const [aiAssisted, setAiAssisted] = useState(false);
  const [aiNote, setAiNote] = useState<{ note: string; needsHuman: boolean } | null>(null);
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string>();
  const [suggesting, startSuggest] = useTransition();
  const [sending, startSend] = useTransition();
  const id = `comment-reply-${comment.id}`;
  const tooLong = body.trim().length > COMMENT_MAX_LENGTH;
  const errText = (code: string) => (tInbox.has(`errors.${code}`) ? tInbox(`errors.${code}`) : tInbox("errors.default"));

  return (
    <div className="ml-6 space-y-3 rounded-xl border p-3">
      <div className="space-y-1.5">
        <Label htmlFor={id}>{t("replyLabel", { user: comment.username ? `@${comment.username}` : tInbox("unknownSender") })}</Label>
        <Textarea id={id} rows={3} value={body} maxLength={COMMENT_MAX_LENGTH} disabled={sending} placeholder={t("replyPlaceholder")} onChange={(e) => setBody(e.target.value)} aria-describedby={`${id}-help`} />
        <div id={`${id}-help`} className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{aiAssisted ? tInbox("composer.aiDraftNote") : t("publicNote")}</span>
          <span className={cn("font-mono tabular-nums", tooLong && "text-destructive")}>
            {body.length}/{COMMENT_MAX_LENGTH}
          </span>
        </div>
      </div>
      {aiNote && (
        <p role="status" className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-xs", aiNote.needsHuman ? "border-warning/40 text-warning" : "text-muted-foreground")}>
          {aiNote.needsHuman ? <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
          <span>
            {aiNote.needsHuman && <strong className="font-medium">{tInbox("composer.needsHuman")} </strong>}
            {aiNote.note}
          </span>
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {errText(error)}{" "}
          {error === "insufficient_credits" && (
            <a href="/app/billing" className="font-semibold underline">
              {tInbox("buyCredits")}
            </a>
          )}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor={`${id}-instr`} className="text-xs text-muted-foreground">
            {tInbox("composer.instructions")}
          </Label>
          <Input id={`${id}-instr`} value={instructions} maxLength={500} disabled={!agentsConfigured} placeholder={t("instructionsPlaceholder")} onChange={(e) => setInstructions(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="brand"
            size="sm"
            disabled={!agentsConfigured || suggesting || balance < REPLY_CREDITS}
            title={!agentsConfigured ? tInbox("composer.aiNotConfigured") : undefined}
            onClick={() =>
              startSuggest(async () => {
                setError(undefined);
                const res = await suggestCommentReplyAction(comment.id, instructions);
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                if (res.data) {
                  setBody(res.data.body);
                  setAiAssisted(true);
                  setAiNote({ note: res.data.note, needsHuman: res.data.needsHuman });
                }
                router.refresh();
              })
            }
          >
            <Sparkles aria-hidden /> {suggesting ? tInbox("composer.suggesting") : tInbox("composer.suggest")}
          </Button>
          <CreditCost credits={REPLY_CREDITS} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {tInbox("cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={sending || !body.trim() || tooLong}
          onClick={() =>
            startSend(async () => {
              setError(undefined);
              const res = await replyToCommentAction(comment.id, body, aiAssisted);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              toast.success(t("replied"));
              onDone();
              router.refresh();
            })
          }
        >
          <Send aria-hidden /> {sending ? tInbox("composer.sending") : t("send")}
        </Button>
      </div>
    </div>
  );
}
