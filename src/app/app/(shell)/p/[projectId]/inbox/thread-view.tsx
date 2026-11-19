"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Archive, ArchiveRestore, Clock, Info, Send, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { CreditCost } from "@/components/kreo/credit-cost";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { InboxChannel } from "@/lib/supabase/types/inbox";
import { cn } from "@/lib/utils";
import { fitsInstagram, messagingWindow } from "@/lib/inbox/window";
import { markRead, saveDraft, sendReplyAction, setThreadStatus, suggestReplyAction } from "./actions";
import { ChannelIcon } from "./channel-icon";

type Msg = { id: string; direction: "in" | "out"; sender: string | null; body: string; sentAt: string; aiAssisted: boolean; viaKreo: boolean };

const REPLY_CREDITS = 1;

export function ThreadView({
  canEdit,
  balance,
  agentsConfigured,
  humanAgent,
  channel,
  connectionLabel,
  connectionActive,
  thread,
  messages,
  draft,
}: {
  canEdit: boolean;
  balance: number;
  agentsConfigured: boolean;
  humanAgent: boolean;
  channel: InboxChannel;
  connectionLabel: string;
  connectionActive: boolean;
  thread: { id: string; subject: string | null; name: string | null; handle: string | null; status: "open" | "archived"; unread: boolean; lastInboundAt: string | null };
  messages: Msg[];
  draft: { body: string; ai_generated: boolean } | null;
}) {
  const t = useTranslations("inbox");
  const format = useFormatter();
  const router = useRouter();
  const [body, setBody] = useState(draft?.body ?? "");
  const [savedBody, setSavedBody] = useState(draft?.body ?? "");
  const [aiAssisted, setAiAssisted] = useState(Boolean(draft?.ai_generated));
  const [aiNote, setAiNote] = useState<{ note: string; needsHuman: boolean } | null>(null);
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string>();
  const [suggesting, startSuggest] = useTransition();
  const [sending, startSend] = useTransition();
  const [archiving, startArchive] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  // Al abrir un hilo no leído, se marca como leído (solo en Kreo: no cambia nada en Gmail/Outlook/Instagram).
  useEffect(() => {
    if (thread.unread && canEdit) void markRead(thread.id);
  }, [thread.id, thread.unread, canEdit]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  const isIg = channel === "instagram";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const win = useMemo(() => messagingWindow(thread.lastInboundAt, new Date(now), humanAgent), [thread.lastInboundAt, humanAgent, now]);
  const maxLen = isIg ? 1000 : 10000;
  const tooLong = isIg ? !fitsInstagram(body) : body.length > maxLen;
  const blockedByWindow = isIg && !win.canSend;
  const canSend = canEdit && connectionActive && body.trim().length > 0 && !tooLong && !blockedByWindow && Boolean(thread.lastInboundAt);
  const errText = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.default"));

  function persistDraft() {
    if (!canEdit || body === savedBody) return;
    setSavedBody(body);
    void saveDraft(thread.id, body);
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row flex-wrap items-start gap-3 border-b px-4 py-3">
        <ChannelIcon channel={channel} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium">{thread.name ?? thread.handle ?? t("unknownSender")}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {thread.handle && thread.handle !== thread.name ? `${thread.handle} · ` : ""}
            {t("via", { account: connectionLabel })}
          </p>
          {thread.subject && <p className="mt-1 truncate text-sm">{thread.subject}</p>}
        </div>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            disabled={archiving}
            onClick={() =>
              startArchive(async () => {
                const res = await setThreadStatus(thread.id, thread.status === "archived" ? "open" : "archived");
                if (!res.ok) toast.error(errText(res.error));
                router.refresh();
              })
            }
          >
            {thread.status === "archived" ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
            {thread.status === "archived" ? t("unarchive") : t("archive")}
          </Button>
        )}
      </CardHeader>

      <CardContent className="max-h-[52vh] space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && <p className="text-center text-sm text-muted-foreground">{t("noMessages")}</p>}
        {messages.map((m) => (
          <article key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-lg border px-3 py-2", m.direction === "out" ? "border-primary/30 bg-primary/5" : "bg-secondary")}>
              <p className="mb-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/80">{m.direction === "out" ? t("you") : (m.sender ?? thread.name ?? t("unknownSender"))}</span>
                <time dateTime={m.sentAt} className="font-mono tabular-nums">
                  {format.dateTime(new Date(m.sentAt), { dateStyle: "short", timeStyle: "short" })}
                </time>
                {m.viaKreo && <span>· {t("sentFromKreo")}</span>}
                {m.aiAssisted && <span>· {t("aiAssisted")}</span>}
              </p>
              {/* Texto plano: nunca renderizamos HTML del remitente. */}
              <p className="text-sm break-words whitespace-pre-wrap">{m.body || "—"}</p>
            </div>
          </article>
        ))}
        <div ref={endRef} />
      </CardContent>

      <div className="space-y-3 border-t px-4 py-4">
        {isIg && (
          <p
            role="note"
            className={cn(
              "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
              win.mode === "response" ? "border-border text-muted-foreground" : win.mode === "human_agent" ? "border-warning/40 text-warning" : "border-destructive/40 text-destructive",
            )}
          >
            <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              {win.mode === "response" && t("window.open", { time: format.relativeTime(win.closesAt, new Date(now)) })}
              {win.mode === "human_agent" && t("window.humanAgent", { time: format.relativeTime(win.closesAt, new Date(now)) })}
              {win.mode === "closed" && (humanAgent ? t("window.closedHumanAgent") : t("window.closed"))}
            </span>
          </p>
        )}
        {!connectionActive && <p className="text-xs text-warning">{t("connectionInactive")}</p>}

        {!canEdit ? (
          <p className="text-xs text-muted-foreground">{t("composer.viewerNote")}</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="reply-body">{t("composer.label")}</Label>
              <Textarea
                id="reply-body"
                rows={5}
                value={body}
                maxLength={maxLen}
                disabled={blockedByWindow || sending}
                placeholder={blockedByWindow ? t("composer.placeholderClosed") : t("composer.placeholder")}
                onChange={(e) => setBody(e.target.value)}
                onBlur={persistDraft}
                aria-invalid={tooLong || undefined}
                aria-describedby="reply-help"
              />
              <div id="reply-help" className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>{aiAssisted ? t("composer.aiDraftNote") : t("composer.humanNote")}</span>
                <span className={cn("font-mono tabular-nums", tooLong && "text-destructive")}>
                  {body.length}/{maxLen}
                </span>
              </div>
            </div>

            {aiNote && (
              <p role="status" className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-xs", aiNote.needsHuman ? "border-warning/40 text-warning" : "text-muted-foreground")}>
                {aiNote.needsHuman ? <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
                <span>
                  {aiNote.needsHuman && <strong className="font-medium">{t("composer.needsHuman")} </strong>}
                  {aiNote.note}
                </span>
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {errText(error)}{" "}
                {error === "insufficient_credits" && (
                  <a href="/app/billing" className="font-semibold underline">
                    {t("buyCredits")}
                  </a>
                )}
              </p>
            )}

            <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="reply-instructions" className="text-xs text-muted-foreground">
                  {t("composer.instructions")}
                </Label>
                <Input
                  id="reply-instructions"
                  value={instructions}
                  maxLength={500}
                  placeholder={t("composer.instructionsPlaceholder")}
                  onChange={(e) => setInstructions(e.target.value)}
                  disabled={!agentsConfigured || blockedByWindow}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="brand"
                  disabled={!agentsConfigured || suggesting || blockedByWindow || balance < REPLY_CREDITS}
                  title={!agentsConfigured ? t("composer.aiNotConfigured") : undefined}
                  onClick={() =>
                    startSuggest(async () => {
                      setError(undefined);
                      const res = await suggestReplyAction(thread.id, instructions);
                      if (!res.ok) {
                        setError(res.error);
                        return;
                      }
                      if (res.data) {
                        setBody(res.data.body);
                        setSavedBody(res.data.body);
                        setAiAssisted(true);
                        setAiNote({ note: res.data.note, needsHuman: res.data.needsHuman });
                      }
                      router.refresh();
                    })
                  }
                >
                  <Sparkles aria-hidden /> {suggesting ? t("composer.suggesting") : t("composer.suggest")}
                </Button>
                <CreditCost credits={REPLY_CREDITS} />
              </div>
            </div>
            {!agentsConfigured && <p className="text-[11px] text-muted-foreground">{t("composer.aiNotConfigured")}</p>}

            <div className="flex flex-wrap items-center justify-end gap-3">
              <p className="mr-auto text-[11px] text-muted-foreground">{t("composer.sendNote")}</p>
              <Button
                type="button"
                disabled={!canSend || sending}
                onClick={() =>
                  startSend(async () => {
                    setError(undefined);
                    const res = await sendReplyAction(thread.id, body, aiAssisted);
                    if (!res.ok) {
                      setError(res.error);
                      return;
                    }
                    toast.success(t("composer.sent"));
                    setBody("");
                    setSavedBody("");
                    setAiAssisted(false);
                    setAiNote(null);
                    router.refresh();
                  })
                }
              >
                <Send aria-hidden /> {sending ? t("composer.sending") : t("composer.send")}
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
