import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft, Inbox, MailOpen, MessagesSquare, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { isAgentsConfigured } from "@/lib/agents";
import { channelConfigured, humanAgentEnabled, INBOX_CHANNELS } from "@/lib/inbox/config";
import { getCreditBalance, getProject, roleAtLeast } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";
import type { InboxChannel } from "@/lib/supabase/types/inbox";
import { cn } from "@/lib/utils";
import { ChannelIcon } from "./channel-icon";
import { ConnectionsPanel } from "./connections-panel";
import { ThreadView } from "./thread-view";

export const maxDuration = 60;

export async function generateMetadata() {
  const t = await getTranslations("inbox");
  return { title: t("title") };
}

const FILTERS = ["all", "unread", "pending", "replied", "archived"] as const;
type Filter = (typeof FILTERS)[number];
const KNOWN_ERRORS = [
  "not_configured", "denied", "invalid_state", "forbidden", "missing_scopes", "no_matching_account", "profile_failed",
  "token_exchange_failed", "subscribe_failed", "rate_limited", "unavailable",
];

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const t = await getTranslations("inbox");
  const format = await getFormatter();
  const project = await getProject(projectId);
  const canEdit = roleAtLeast(project.workspace.role, "editor");
  const isAdmin = roleAtLeast(project.workspace.role, "admin");
  const supabase = await createClient();

  const filter: Filter = (FILTERS as readonly string[]).includes(str("status") ?? "") ? (str("status") as Filter) : "all";
  const connFilter = /^[0-9a-f-]{36}$/i.test(str("conn") ?? "") ? str("conn") : undefined;
  const selectedId = /^[0-9a-f-]{36}$/i.test(str("t") ?? "") ? str("t") : undefined;

  const [{ data: connections }, { data: igAccounts }, balance] = await Promise.all([
    supabase.from("inbox_connections").select("id, channel, external_id, display_name, status, last_synced_at, social_account_id").eq("project_id", projectId).order("created_at"),
    supabase.from("social_accounts").select("id, handle, display_name, status").eq("project_id", projectId).eq("platform", "instagram").order("created_at"),
    getCreditBalance(project.workspace_id),
  ]);
  const conns = connections ?? [];

  let q = supabase
    .from("inbox_threads")
    .select("id, connection_id, subject, counterpart_name, counterpart_handle, snippet, last_message_at, status, unread, needs_reply, replied_at")
    .eq("project_id", projectId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(60);
  if (connFilter) q = q.eq("connection_id", connFilter);
  if (filter === "archived") q = q.eq("status", "archived");
  else q = q.eq("status", "open");
  if (filter === "unread") q = q.eq("unread", true);
  if (filter === "pending") q = q.eq("needs_reply", true);
  if (filter === "replied") q = q.eq("needs_reply", false).not("replied_at", "is", null);
  const { data: threads } = await q;

  const [{ count: unreadCount }, { count: pendingCount }] = await Promise.all([
    supabase.from("inbox_threads").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "open").eq("unread", true),
    supabase.from("inbox_threads").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "open").eq("needs_reply", true),
  ]);

  // Hilo seleccionado (mensajes + borrador).
  let selected = null as null | {
    thread: NonNullable<typeof threads>[number] & { last_inbound_at: string | null };
    channel: InboxChannel;
    connectionLabel: string;
    connectionActive: boolean;
    messages: { id: string; direction: "in" | "out"; sender_name: string | null; body_text: string; sent_at: string; ai_assisted: boolean; sent_by: string | null }[];
    draft: { body: string; ai_generated: boolean } | null;
  };
  if (selectedId) {
    const [{ data: th }, { data: msgs }, { data: draft }] = await Promise.all([
      supabase
        .from("inbox_threads")
        .select("id, connection_id, subject, counterpart_name, counterpart_handle, snippet, last_message_at, last_inbound_at, status, unread, needs_reply, replied_at")
        .eq("id", selectedId)
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase.from("inbox_messages").select("id, direction, sender_name, body_text, sent_at, ai_assisted, sent_by").eq("thread_id", selectedId).order("sent_at").limit(200),
      canEdit ? supabase.from("inbox_drafts").select("body, ai_generated").eq("thread_id", selectedId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const conn = th ? conns.find((c) => c.id === th.connection_id) : undefined;
    if (th && conn) {
      selected = {
        thread: th,
        channel: conn.channel,
        connectionLabel: conn.display_name ?? conn.external_id,
        connectionActive: conn.status === "active",
        messages: dedupeOutbound(msgs ?? []),
        draft: draft ?? null,
      };
    }
  }

  const configured = Object.fromEntries(INBOX_CHANNELS.map((c) => [c, channelConfigured(c)])) as Record<InboxChannel, boolean>;
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status: filter === "all" ? undefined : filter, conn: connFilter, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/app/p/${projectId}/inbox${s ? `?${s}` : ""}`;
  };
  const errorKey = str("error");
  const connectedChannel = str("connected");
  const connById = new Map(conns.map((c) => [c.id, c]));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="label-mono">{project.name}</p>
        <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {errorKey && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {KNOWN_ERRORS.includes(errorKey) ? t(`errors.${errorKey}`) : t("errors.default")}
        </p>
      )}
      {connectedChannel && (INBOX_CHANNELS as string[]).includes(connectedChannel) && (
        <p role="status" className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          {t("connectedOk", { channel: t(`channelNames.${connectedChannel}`) })}
        </p>
      )}

      <ConnectionsPanel
        projectId={projectId}
        canEdit={canEdit}
        isAdmin={isAdmin}
        configured={configured}
        connections={conns.map((c) => ({ id: c.id, channel: c.channel, label: c.display_name ?? c.external_id, status: c.status, lastSyncedAt: c.last_synced_at, socialAccountId: c.social_account_id }))}
        igAccounts={(igAccounts ?? []).map((a) => ({ id: a.id, handle: a.handle ?? a.display_name ?? "instagram" }))}
      />

      {conns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <MessagesSquare className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <p className="font-medium">{t("emptyNoConnections.title")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("emptyNoConnections.body")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          {/* Lista de hilos */}
          <section aria-label={t("listLabel")} className={cn("space-y-3", selected && "hidden lg:block")}>
            <nav aria-label={t("filtersLabel")} className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <Link
                  key={f}
                  href={href({ status: f === "all" ? undefined : f, t: undefined })}
                  aria-current={filter === f ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                    filter === f ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`filters.${f}`)}
                  {f === "unread" && unreadCount ? <span className="font-mono tabular-nums">{unreadCount}</span> : null}
                  {f === "pending" && pendingCount ? <span className="font-mono tabular-nums">{pendingCount}</span> : null}
                </Link>
              ))}
            </nav>
            {conns.length > 1 && (
              <nav aria-label={t("accountsLabel")} className="flex flex-wrap gap-1">
                <Link
                  href={href({ conn: undefined, t: undefined })}
                  aria-current={!connFilter ? "page" : undefined}
                  className={cn("rounded-sm border px-2 py-0.5 text-xs", !connFilter ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}
                >
                  {t("allAccounts")}
                </Link>
                {conns.map((c) => (
                  <Link
                    key={c.id}
                    href={href({ conn: c.id, t: undefined })}
                    aria-current={connFilter === c.id ? "page" : undefined}
                    className={cn("inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs", connFilter === c.id ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}
                  >
                    <ChannelIcon channel={c.channel} className="size-4 text-[8px]" />
                    <span className="max-w-[160px] truncate">{c.display_name ?? c.external_id}</span>
                  </Link>
                ))}
              </nav>
            )}

            <Card className="py-0">
              <CardContent className="p-0">
                {(threads ?? []).length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                    <Inbox className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                    <p className="text-sm font-medium">{t(`emptyList.${filter}`)}</p>
                    <p className="text-xs text-muted-foreground">{t("emptyList.hint")}</p>
                  </div>
                ) : (
                  <ul className="divide-y">
                    {(threads ?? []).map((th) => {
                      const c = connById.get(th.connection_id);
                      const active = th.id === selectedId;
                      return (
                        <li key={th.id}>
                          <Link
                            href={href({ t: th.id })}
                            aria-current={active ? "true" : undefined}
                            className={cn(
                              "flex gap-3 px-3 py-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                              active && "bg-secondary shadow-[inset_2px_0_0_var(--primary)]",
                            )}
                          >
                            {c && <ChannelIcon channel={c.channel} />}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className={cn("truncate text-sm", th.unread ? "font-semibold" : "font-medium")}>
                                  {th.counterpart_name ?? th.counterpart_handle ?? t("unknownSender")}
                                </span>
                                {th.last_message_at && (
                                  <time dateTime={th.last_message_at} className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                                    {format.relativeTime(new Date(th.last_message_at))}
                                  </time>
                                )}
                              </div>
                              {th.subject && <p className="truncate text-xs">{th.subject}</p>}
                              <p className="truncate text-xs text-muted-foreground">{th.snippet ?? "—"}</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {th.unread && <Tag tone="primary">{t("tags.unread")}</Tag>}
                                {th.needs_reply && th.status === "open" && <Tag tone="warning">{t("tags.pending")}</Tag>}
                                {!th.needs_reply && th.replied_at && <Tag tone="success">{t("tags.replied")}</Tag>}
                                {th.status === "archived" && <Tag tone="muted">{t("tags.archived")}</Tag>}
                              </div>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Hilo */}
          <section aria-label={t("threadLabel")} className={cn(!selected && "hidden lg:block")}>
            {selected ? (
              <div className="space-y-3">
                <Link href={href({ t: undefined })} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground lg:hidden">
                  <ArrowLeft className="size-4" aria-hidden /> {t("back")}
                </Link>
                <ThreadView
                  key={selected.thread.id}
                  canEdit={canEdit}
                  balance={balance}
                  agentsConfigured={isAgentsConfigured()}
                  humanAgent={humanAgentEnabled()}
                  channel={selected.channel}
                  connectionLabel={selected.connectionLabel}
                  connectionActive={selected.connectionActive}
                  thread={{
                    id: selected.thread.id,
                    subject: selected.thread.subject,
                    name: selected.thread.counterpart_name,
                    handle: selected.thread.counterpart_handle,
                    status: selected.thread.status,
                    unread: selected.thread.unread,
                    lastInboundAt: selected.thread.last_inbound_at,
                  }}
                  messages={selected.messages.map((m) => ({ id: m.id, direction: m.direction, sender: m.sender_name, body: m.body_text, sentAt: m.sent_at, aiAssisted: m.ai_assisted, viaKreo: Boolean(m.sent_by) }))}
                  draft={selected.draft}
                />
              </div>
            ) : (
              <Card className="h-full">
                <CardContent className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 text-center">
                  <MailOpen className="size-7 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                  <p className="font-medium">{t("selectThread.title")}</p>
                  <p className="max-w-sm text-sm text-muted-foreground">{t("selectThread.body")}</p>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
        {t("retention")}
      </p>
    </div>
  );
}

function Tag({ tone, children }: { tone: "primary" | "warning" | "success" | "muted"; children: React.ReactNode }) {
  const cls = {
    primary: "border-primary/40 text-primary-ink",
    warning: "border-warning/40 text-warning",
    success: "border-success/40 text-success",
    muted: "text-muted-foreground",
  }[tone];
  return <span className={cn("rounded-sm border px-1.5 py-px text-[10px] font-medium", cls)}>{children}</span>;
}

/**
 * Outlook no devuelve el id de la respuesta enviada: guardamos una copia provisional (con quién la envió) y luego la
 * sincronización trae la real desde "Enviados". Ocultamos el duplicado (mismo texto en < 15 min).
 */
function dedupeOutbound<T extends { direction: string; body_text: string; sent_at: string; sent_by: string | null }>(msgs: T[]): T[] {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 500);
  return msgs.filter((m) => {
    if (m.direction !== "out" || m.sent_by) return true;
    return !msgs.some((o) => o !== m && o.direction === "out" && o.sent_by && norm(o.body_text) === norm(m.body_text) && Math.abs(new Date(o.sent_at).getTime() - new Date(m.sent_at).getTime()) < 15 * 60_000);
  });
}
