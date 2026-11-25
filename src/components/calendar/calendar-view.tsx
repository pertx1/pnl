"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PostCard, PostThumb, STATUS_COLOR, StatusChip, type ThumbCover } from "@/components/kreo/post-thumb";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CalendarPost = {
  id: string;
  projectId: string;
  projectName?: string;
  title: string | null;
  caption: string;
  status: string;
  scheduledAt: string | null;
  aiGenerated: boolean;
  platforms: string[];
  /** Miniatura firmada del primer medio (si tiene). */
  cover?: ThumbCover | null;
};

type View = "month" | "week" | "list";
type RescheduleFn = (projectId: string, postId: string, iso: string) => Promise<{ ok?: boolean; error?: string }>;

const DRAGGABLE = ["draft", "pending_approval", "approved", "scheduled"];

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function parseDay(s: string | undefined) {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
function startOfWeek(d: Date) {
  const r = new Date(d);
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); // lunes
  return r;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function CalendarView({
  posts: initialPosts,
  view,
  day,
  newPostBase,
  reschedule,
  showProject = false,
}: {
  posts: CalendarPost[];
  view: View;
  day?: string;
  /** Ruta base para crear una publicación (se añade ?date=YYYY-MM-DD). */
  newPostBase?: string;
  reschedule: RescheduleFn;
  showProject?: boolean;
}) {
  const t = useTranslations("calendar");
  const tp = useTranslations("posts.status");
  const te = useTranslations("posts.errorsX");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [posts, setPosts] = useState(initialPosts);
  const [, start] = useTransition();
  const [dragOver, setDragOver] = useState<string | null>(null);

  const anchor = parseDay(day);
  const go = (v: View, d: Date) => router.push(`${pathname}?view=${v}&d=${dayKey(d)}`);

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarPost[]>();
    for (const p of posts) {
      if (!p.scheduledAt) continue;
      const k = dayKey(new Date(p.scheduledAt));
      m.set(k, [...(m.get(k) ?? []), p].sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!)));
    }
    return m;
  }, [posts]);
  const unscheduled = posts.filter((p) => !p.scheduledAt && !["cancelled"].includes(p.status));

  function onDrop(targetDay: string, postId: string) {
    setDragOver(null);
    const post = posts.find((p) => p.id === postId);
    if (!post || !DRAGGABLE.includes(post.status)) return;
    const base = post.scheduledAt ? new Date(post.scheduledAt) : new Date(new Date().setHours(19, 0, 0, 0));
    const [y, m, d] = targetDay.split("-").map(Number);
    const next = new Date(y, m - 1, d, base.getHours(), base.getMinutes());
    if (next.getTime() < Date.now()) {
      toast.error(te("scheduled_in_past"));
      return;
    }
    const prev = posts;
    setPosts((ps) => ps.map((p) => (p.id === postId ? { ...p, scheduledAt: next.toISOString() } : p)));
    start(async () => {
      const res = await reschedule(post.projectId, postId, next.toISOString());
      if (!res.ok) {
        setPosts(prev);
        toast.error(te.has(res.error ?? "") ? te(res.error!) : te("generic"));
        return;
      }
      toast.success(post.status === "scheduled" ? t("rescheduled") : t("rescheduled"));
      router.refresh();
    });
  }

  const Chip = ({ p, compact }: { p: CalendarPost; compact?: boolean }) => (
    <Link
      href={`/app/p/${p.projectId}/posts/${p.id}`}
      draggable={DRAGGABLE.includes(p.status)}
      onDragStart={(e) => e.dataTransfer.setData("text/post-id", p.id)}
      className="relative flex min-w-0 items-start gap-1.5 rounded-lg border bg-card p-1 text-xs hover:border-selected/60 focus-visible:outline-2 focus-visible:outline-ring"
      style={{ borderLeft: `3px solid ${STATUS_COLOR[p.status]}` }}
      title={`${tp(p.status)} · ${p.title || p.caption.slice(0, 60)}`}
    >
      <PostThumb cover={p.cover} className={cn("shrink-0 rounded-md", compact ? "h-8 w-6" : "h-14 w-10")} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          {p.scheduledAt && <span className="font-mono text-[10px] text-muted-foreground">{format.dateTime(new Date(p.scheduledAt), { hour: "2-digit", minute: "2-digit" })}</span>}
          {p.aiGenerated && <Sparkles className="size-3 text-brand-amber-ink" aria-label={t("aiLabel")} />}
        </span>
        <span className="block truncate font-medium">{p.title || p.caption.slice(0, 40) || "—"}</span>
        <span className="sr-only">· {tp(p.status)}</span>
        {!compact && (
          <span className="mt-0.5 flex items-center gap-1">
            {[...new Set(p.platforms)].map((pl) => (
              <PlatformIcon key={pl} platform={pl} className="size-4 rounded-[5px] text-[7px]" />
            ))}
            {showProject && p.projectName && <span className="truncate text-[10px] text-muted-foreground">{p.projectName}</span>}
          </span>
        )}
      </span>
    </Link>
  );

  const DayCell = ({ d, muted, tall }: { d: Date; muted?: boolean; tall?: boolean }) => {
    const k = dayKey(d);
    const isToday = k === dayKey(new Date());
    const items = byDay.get(k) ?? [];
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(k);
        }}
        onDragLeave={() => setDragOver((x) => (x === k ? null : x))}
        onDrop={(e) => onDrop(k, e.dataTransfer.getData("text/post-id"))}
        className={cn("group flex flex-col gap-1 border-r border-b p-1.5", tall ? "min-h-64" : "min-h-28", muted && "bg-secondary/30", dragOver === k && "bg-primary/10")}
      >
        <div className="flex items-center justify-between">
          <span className={cn("grid h-6 min-w-6 place-items-center rounded-full px-1 font-mono text-xs", isToday ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground")}>{d.getDate()}</span>
          {newPostBase && (
            <Link
              href={`${newPostBase}?date=${k}`}
              className="grid size-6 place-items-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100 pointer-coarse:opacity-100"
              aria-label={t("newOnDay", { date: format.dateTime(d, { day: "numeric", month: "long" }) })}
            >
              <Plus className="size-3.5 text-muted-foreground" aria-hidden />
            </Link>
          )}
        </div>
        {items.map((p) => (
          <Chip key={p.id} p={p} compact={!tall} />
        ))}
      </div>
    );
  };

  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short" }).format(addDays(startOfWeek(new Date(2026, 0, 5)), i)),
  );

  let body: React.ReactNode;
  let label: string;
  let step: (dir: number) => Date;

  if (view === "week") {
    const s = startOfWeek(anchor);
    label = `${format.dateTime(s, { day: "numeric", month: "short" })} – ${format.dateTime(addDays(s, 6), { day: "numeric", month: "short", year: "numeric" })}`;
    step = (dir) => addDays(anchor, 7 * dir);
    body = (
      <div className="overflow-x-auto rounded-2xl border">
        <div className="-mr-px -mb-px grid min-w-[720px] grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => addDays(s, i)).map((d, i) => (
            <div key={i}>
              <div className="border-r border-b px-1.5 py-1 label-mono">{weekdays[i]}</div>
              <DayCell d={d} tall />
            </div>
          ))}
        </div>
      </div>
    );
  } else if (view === "list") {
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    label = format.dateTime(from, { month: "long", year: "numeric" });
    step = (dir) => new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
    const items = posts
      .filter((p) => p.scheduledAt && new Date(p.scheduledAt) >= from && new Date(p.scheduledAt) < to)
      .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
    body = items.length ? (
      <ul className="divide-y rounded-2xl border">
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/app/p/${p.projectId}/posts/${p.id}`} className="flex min-h-11 flex-wrap items-center gap-3 px-3 py-2 hover:bg-secondary/50">
              <PostThumb cover={p.cover} className="h-14 w-10 shrink-0 rounded-lg" />
              <span className="w-36 font-mono text-xs text-muted-foreground">{format.dateTime(new Date(p.scheduledAt!), { dateStyle: "medium", timeStyle: "short" })}</span>
              <span className="flex gap-1">
                {p.platforms.map((pl, i) => (
                  <PlatformIcon key={i} platform={pl} className="size-5 text-[8px]" />
                ))}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.title || p.caption.slice(0, 80) || "—"}</span>
              {showProject && <span className="text-xs text-muted-foreground">{p.projectName}</span>}
              {p.aiGenerated && <Sparkles className="size-3.5 text-brand-amber-ink" aria-label={t("aiLabel")} />}
              <StatusChip status={p.status} label={tp(p.status)} className="bg-secondary" />
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <div className="rounded-2xl border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
        <p>{t("empty")}</p>
        {newPostBase && <p className="mt-1 text-xs">{t("emptyCreateHint")}</p>}
      </div>
    );
  } else {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const s = startOfWeek(first);
    label = format.dateTime(first, { month: "long", year: "numeric" });
    step = (dir) => new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
    const weeks = Math.ceil((((first.getDay() + 6) % 7) + new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()) / 7);
    body = (
      <div className="overflow-x-auto rounded-2xl border">
        <div className="-mr-px -mb-px grid min-w-[720px] grid-cols-7">
          {weekdays.map((w) => (
            <div key={w} className="border-r border-b px-1.5 py-1 label-mono">
              {w}
            </div>
          ))}
          {Array.from({ length: weeks * 7 }, (_, i) => addDays(s, i)).map((d) => (
            <DayCell key={dayKey(d)} d={d} muted={d.getMonth() !== anchor.getMonth()} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" aria-label={t("prev")} onClick={() => go(view, step(-1))}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => go(view, new Date())}>
            {t("today")}
          </Button>
          <Button variant="outline" size="icon-sm" aria-label={t("next")} onClick={() => go(view, step(1))}>
            <ChevronRight />
          </Button>
          <span className="ml-2 font-heading text-lg font-semibold first-letter:uppercase">{label}</span>
        </div>
        <div className="flex gap-1 rounded-full border bg-secondary/40 p-1" role="tablist" aria-label={t("viewLabel")}>
          {(["month", "week", "list"] as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => go(v, anchor)}
              className={cn(
                "min-h-8 rounded-full px-3.5 text-sm font-medium transition-colors pointer-coarse:min-h-11",
                view === v ? "bg-background text-foreground shadow-[inset_0_0_0_1px_var(--border-strong)]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(v)}
            </button>
          ))}
        </div>
      </div>
      {view !== "list" && (
        <p className="text-xs text-muted-foreground">
          {posts.some((p) => p.scheduledAt) ? t("dragHint") : newPostBase ? t("emptyCalendarHint") : t("empty")}
        </p>
      )}
      {body}
      {unscheduled.length > 0 && (
        <div className="space-y-2">
          <h2 className="section-title">{t("unscheduled")}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {unscheduled.map((p) => (
              <li key={p.id}>
                <PostCard
                  post={{ id: p.id, projectId: p.projectId, title: p.title || p.caption.slice(0, 80) || "—", status: p.status, platforms: p.platforms, aiGenerated: p.aiGenerated, cover: p.cover, projectName: showProject ? p.projectName : undefined }}
                  statusLabel={tp(p.status)}
                  aiLabel={t("aiLabel")}
                  className="h-full"
                  draggable={DRAGGABLE.includes(p.status)}
                  onDragStart={(e) => e.dataTransfer.setData("text/post-id", p.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
