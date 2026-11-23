"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
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
};

type View = "month" | "week" | "list";
type RescheduleFn = (projectId: string, postId: string, iso: string) => Promise<{ ok?: boolean; error?: string }>;

const STATUS_COLOR: Record<string, string> = {
  draft: "var(--muted-foreground)",
  pending_approval: "var(--warning)",
  approved: "var(--info)",
  scheduled: "var(--primary-ink)",
  scheduled_on_platform: "var(--info)",
  publishing: "var(--info)",
  published: "var(--success)",
  failed: "var(--destructive)",
  cancelled: "var(--muted-foreground)",
};
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
      className="block rounded-sm border bg-card px-1.5 py-1 text-xs hover:border-selected/60 focus-visible:outline-2 focus-visible:outline-ring"
      style={{ borderLeft: `3px solid ${STATUS_COLOR[p.status]}` }}
      title={`${tp(p.status)} · ${p.title || p.caption.slice(0, 60)}`}
    >
      <div className="flex items-center gap-1">
        {p.scheduledAt && <span className="font-mono text-[10px] text-muted-foreground">{format.dateTime(new Date(p.scheduledAt), { hour: "2-digit", minute: "2-digit" })}</span>}
        {p.aiGenerated && <Sparkles className="size-3 text-brand-amber-ink" aria-label={t("aiLabel")} />}
      </div>
      <div className="truncate font-medium">{p.title || p.caption.slice(0, 40) || "—"}</div>
      {!compact && (
        <div className="mt-0.5 flex items-center gap-1">
          {p.platforms.map((pl, i) => (
            <PlatformIcon key={i} platform={pl} className="size-4 text-[7px]" />
          ))}
          {showProject && p.projectName && <span className="truncate text-[10px] text-muted-foreground">{p.projectName}</span>}
        </div>
      )}
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
          <span className={cn("font-mono text-xs", isToday ? "rounded-sm bg-primary px-1 text-primary-foreground" : "text-muted-foreground")}>{d.getDate()}</span>
          {newPostBase && (
            <Link
              href={`${newPostBase}?date=${k}`}
              className="rounded-sm opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
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
      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7 border-t border-l">
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
      <ul className="divide-y rounded-lg border">
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/app/p/${p.projectId}/posts/${p.id}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-secondary/50">
              <span className="w-36 font-mono text-xs text-muted-foreground">{format.dateTime(new Date(p.scheduledAt!), { dateStyle: "medium", timeStyle: "short" })}</span>
              <span className="flex gap-1">
                {p.platforms.map((pl, i) => (
                  <PlatformIcon key={i} platform={pl} className="size-5 text-[8px]" />
                ))}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.title || p.caption.slice(0, 80) || "—"}</span>
              {showProject && <span className="text-xs text-muted-foreground">{p.projectName}</span>}
              {p.aiGenerated && <Sparkles className="size-3.5 text-brand-amber-ink" aria-label={t("aiLabel")} />}
              <span className="text-xs font-semibold" style={{ color: STATUS_COLOR[p.status] }}>
                {tp(p.status)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <div className="rounded-lg border px-3 py-8 text-center text-sm text-muted-foreground">
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
      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7 border-t border-l">
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
          <span className="ml-2 font-semibold capitalize">{label}</span>
        </div>
        <div className="flex gap-1 rounded-md border p-0.5" role="tablist">
          {(["month", "week", "list"] as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => go(v, anchor)}
              className={cn("rounded-sm px-2.5 py-1 text-sm", view === v ? "bg-secondary font-semibold" : "text-muted-foreground hover:text-foreground")}
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
          <h2 className="label-mono">{t("unscheduled")}</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {unscheduled.map((p) => (
              <Chip key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
