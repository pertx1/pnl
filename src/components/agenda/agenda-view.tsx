"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Clock, Info, Plus, Repeat, Settings2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { moveAgendaBlock } from "@/app/app/(shell)/agenda/actions";
import { ProjectDot } from "@/components/dashboard/project-dot";
import { PlatformIcon } from "@/components/social/platform-icon";
import { Button } from "@/components/ui/button";
import { addDays, hhmm, type DaySettings, type FreeSlot, type Occurrence } from "@/lib/agenda/core";
import type { PlanCandidate } from "@/lib/agenda/server";
import { zonedParts } from "@/lib/mcp/calendar";
import type { AgendaBlockRow } from "@/lib/supabase/types/agenda";
import { cn } from "@/lib/utils";
import { BlockDialog, type BlockDraft } from "./block-dialog";
import { dayDate, useDuration } from "./format";
import { KIND_STYLE } from "./kinds";
import { PlanDialog } from "./plan-dialog";
import { SettingsDialog } from "./settings-dialog";

export type AgendaPost = { id: string; projectId: string; title: string; status: string; scheduledAt: string; platforms: string[] };
type FreeDay = { day: string; slots: FreeSlot[]; totalMinutes: number };
type Project = { id: string; name: string; color: number };

/** Píxeles por hora de la rejilla. */
const HOUR = 52;

type Props = {
  available: boolean;
  view: "day" | "week";
  anchor: string;
  today: string;
  nowIso: string;
  days: string[];
  settings: DaySettings;
  blocks: AgendaBlockRow[];
  occurrences: Occurrence[];
  free: FreeDay[];
  posts: AgendaPost[];
  projects: Project[];
  candidates: PlanCandidate[];
  openNew: boolean;
  openPlan: boolean;
};

/** Reparte en columnas los bloques que se solapan dentro de un día. */
function layoutLanes(occ: Occurrence[]) {
  const sorted = [...occ].sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute);
  const out = new Map<Occurrence, { lane: number; lanes: number }>();
  let cluster: Occurrence[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const o of cluster) out.get(o)!.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const o of sorted) {
    if (o.startMinute >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= o.startMinute);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(o.endMinute);
    } else laneEnds[lane] = o.endMinute;
    out.set(o, { lane, lanes: 1 });
    cluster.push(o);
    clusterEnd = Math.max(clusterEnd, o.endMinute);
  }
  flush();
  return out;
}

export function AgendaView(p: Props) {
  const t = useTranslations("agenda");
  const format = useFormatter();
  const duration = useDuration();
  const router = useRouter();
  const tz = p.settings.timezone;
  const nowMinutes = zonedParts(new Date(p.nowIso), tz).minutes;
  const newDay = p.anchor < p.today ? p.today : p.anchor;
  /** Hora por defecto de un bloque nuevo: la próxima media hora si es hoy; si no, las 10:00 (o el inicio de la jornada). */
  const defaultStart = (day: string) => Math.min(1380, Math.max(p.settings.startMinute, day === p.today ? Math.ceil((nowMinutes + 1) / 30) * 30 : 600));
  const [draft, setDraft] = useState<BlockDraft | null>(
    p.openNew && p.available ? { mode: "new", day: newDay, start: defaultStart(newDay), end: Math.min(1440, defaultStart(newDay) + 60) } : null,
  );
  const [planOpen, setPlanOpen] = useState(p.openPlan && p.available);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [, startMove] = useTransition();
  const [preview, setPreview] = useState<{ blockId: string; day: string; minute: number } | null>(null);
  const drag = useRef<{ occ: Occurrence; startY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const blockById = new Map(p.blocks.map((b) => [b.id, b]));
  const projectIndex = new Map(p.projects.map((x) => [x.id, x.color]));
  const projectName = new Map(p.projects.map((x) => [x.id, x.name]));
  const colorOf = (id: string | null) => (id ? (projectIndex.get(id) ?? 0) : 0);
  const freeByDay = new Map(p.free.map((f) => [f.day, f]));
  const nowParts = { minutes: nowMinutes };
  const tasks = p.candidates.filter((c) => c.type === "task" && c.taskId).map((c) => ({ id: c.taskId!, title: c.title, projectId: c.projectId }));

  const postsByDay = new Map<string, (AgendaPost & { minute: number; time: string })[]>();
  for (const post of p.posts) {
    const z = zonedParts(new Date(post.scheduledAt), tz);
    if (!p.days.includes(z.day)) continue;
    postsByDay.set(z.day, [...(postsByDay.get(z.day) ?? []), { ...post, minute: z.minutes, time: z.time }]);
  }
  const occByDay = new Map<string, Occurrence[]>();
  for (const o of p.occurrences) occByDay.set(o.day, [...(occByDay.get(o.day) ?? []), o]);

  // Horas visibles: la jornada, ampliada si hay bloques o publicaciones fuera de ella.
  const minStart = Math.min(p.settings.startMinute, ...p.occurrences.map((o) => o.startMinute), ...[...postsByDay.values()].flat().map((x) => x.minute));
  const maxEnd = Math.max(p.settings.endMinute, ...p.occurrences.map((o) => o.endMinute), ...[...postsByDay.values()].flat().map((x) => x.minute + 30));
  const startHour = Math.max(0, Math.floor(minStart / 60));
  const endHour = Math.min(24, Math.ceil(maxEnd / 60));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const gridH = (endHour - startHour) * HOUR;
  const y = (minute: number) => ((minute - startHour * 60) / 60) * HOUR;

  // Al abrir, la rejilla se desplaza a la hora actual (hoy) o al primer bloque.
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstMinute = p.days.includes(p.today) ? nowMinutes : Math.min(p.settings.startMinute, ...p.occurrences.map((o) => o.startMinute));
  const scrollTop = Math.max(0, y(firstMinute) - HOUR);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollTop });
  }, [scrollTop]);

  const qs = (view: "day" | "week", d: string) => `/app/agenda?view=${view}&d=${d}`;
  const step = p.view === "day" ? 1 : 7;
  const fmtLong = (day: string) => format.dateTime(dayDate(day), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const rangeLabel =
    p.view === "day"
      ? fmtLong(p.anchor)
      : `${format.dateTime(dayDate(p.days[0]), { day: "numeric", month: "short", timeZone: "UTC" })} – ${format.dateTime(dayDate(p.days.at(-1)!), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;

  // Resumen de tiempo libre: hoy si está en la vista; si no, el día mostrado (o el primero de la semana).
  const focusDay = p.days.includes(p.today) ? p.today : p.days[0];
  const focusFree = freeByDay.get(focusDay);
  const isPast = focusDay < p.today;

  const openNewAt = (day: string, minute: number) => {
    if (!p.available) return;
    const start = Math.max(0, Math.min(1380, minute));
    setDraft({ mode: "new", day, start, end: Math.min(1440, start + 60) });
  };
  const openEdit = (o: Occurrence) => {
    const block = blockById.get(o.blockId);
    if (block) setDraft({ mode: "edit", day: o.day, block });
  };

  const onGridClick = (day: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minute = startHour * 60 + Math.floor(((e.clientY - rect.top) / HOUR) * 2) * 30;
    openNewAt(day, minute);
  };

  // Arrastrar (solo ratón y solo bloques puntuales; en móvil y en series se usa el formulario).
  const onPointerDown = (o: Occurrence, e: React.PointerEvent<HTMLButtonElement>) => {
    if (!p.available || o.recurring || e.pointerType !== "mouse" || e.button !== 0) return;
    drag.current = { occ: o, startY: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dy) < 6) return;
    d.moved = true;
    const len = d.occ.endMinute - d.occ.startMinute;
    const minute = Math.max(0, Math.min(1440 - len, d.occ.startMinute + Math.round(((dy / HOUR) * 60) / 15) * 15));
    setPreview({ blockId: d.occ.blockId, day: d.occ.day, minute });
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    suppressClick.current = true;
    const target = preview;
    if (!target || target.minute === d.occ.startMinute) {
      setPreview(null);
      return;
    }
    startMove(async () => {
      const res = await moveAgendaBlock(d.occ.blockId, d.occ.day, target.minute);
      if (res.ok) toast.success(t("toastMoved", { time: hhmm(target.minute) }));
      else toast.error(t(`errors.${res.error}`));
      setPreview(null);
      router.refresh();
    });
  };

  const blockButton = (o: Occurrence, compact: boolean, lane?: { lane: number; lanes: number }) => {
    const S = KIND_STYLE[o.kind];
    const moving = preview?.blockId === o.blockId && preview.day === o.day;
    const startMin = moving ? preview.minute : o.startMinute;
    const endMin = startMin + (o.endMinute - o.startMinute);
    const label = t("blockLabel", { title: o.title, start: hhmm(startMin), end: hhmm(endMin), kind: t(`kinds.${o.kind}`) }) + (o.recurring ? `. ${t("recurring")}` : "");
    const style = lane
      ? {
          top: y(startMin),
          height: Math.max(22, y(endMin) - y(startMin) - 2),
          left: `calc(${(lane.lane / lane.lanes) * 100}% + 2px)`,
          width: `calc(${100 / lane.lanes}% - 4px)`,
        }
      : undefined;
    const tall = lane ? y(endMin) - y(startMin) >= 44 : true;
    return (
      <button
        key={`${o.blockId}-${o.day}`}
        type="button"
        aria-label={label}
        title={label}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          openEdit(o);
        }}
        onPointerDown={(e) => onPointerDown(o, e)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setPreview(null);
        }}
        style={style}
        className={cn(
          "group flex overflow-hidden rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          S.tint,
          lane ? "absolute z-10 border border-border/60" : "relative min-h-11 w-full border",
          moving && "z-20 shadow-lg ring-2 ring-selected",
          !o.recurring && p.available && "md:cursor-grab md:active:cursor-grabbing",
        )}
      >
        <span aria-hidden className={cn("w-1 shrink-0", S.bar)} />
        <span className={cn("min-w-0 flex-1 px-2", compact || !tall ? "py-0.5" : "py-1.5")}>
          <span className="flex items-center gap-1">
            <S.icon className={cn("size-3 shrink-0", S.text)} strokeWidth={1.75} aria-hidden />
            <span className="truncate text-xs font-medium text-foreground">{o.title}</span>
            {o.recurring && <Repeat className="size-3 shrink-0 text-muted-foreground" aria-hidden />}
          </span>
          {(tall || !lane) && (
            <span className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-muted-foreground tabular-nums">
              <span>
                {hhmm(startMin)}–{hhmm(endMin)}
              </span>
              {o.projectId && projectName.get(o.projectId) && (
                <span className="inline-flex min-w-0 items-center gap-1 font-sans">
                  <ProjectDot index={colorOf(o.projectId)} className="size-1.5" />
                  <span className="truncate">{projectName.get(o.projectId)}</span>
                </span>
              )}
            </span>
          )}
        </span>
      </button>
    );
  };

  const postChip = (post: AgendaPost & { time: string }, positioned: boolean) => (
    <Link
      key={post.id}
      href={`/app/p/${post.projectId}/posts/${post.id}`}
      aria-label={t("postLabel", { time: post.time, title: post.title || "—", project: projectName.get(post.projectId) ?? "" })}
      title={post.title}
      style={positioned ? { top: y(zonedParts(new Date(post.scheduledAt), tz).minutes) - 10 } : undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border bg-popover px-1.5 font-mono text-[10px] text-muted-foreground tabular-nums shadow-sm hover:border-border-strong hover:text-foreground",
        positioned ? "absolute right-1 z-20 h-5" : "min-h-9 px-2.5 text-xs pointer-coarse:min-h-11",
      )}
    >
      <ProjectDot index={colorOf(post.projectId)} className="size-1.5" />
      {post.platforms[0] ? <PlatformIcon platform={post.platforms[0]} className="size-3" /> : null}
      {post.time}
      {!positioned && <span className="max-w-40 truncate font-sans">{post.title}</span>}
    </Link>
  );

  const dayColumn = (day: string) => {
    const occ = occByDay.get(day) ?? [];
    const lanes = layoutLanes(occ);
    const freeDay = freeByDay.get(day);
    const isToday = day === p.today;
    return (
      <div
        key={day}
        role="presentation"
        onClick={(e) => onGridClick(day, e)}
        className={cn("relative border-l", p.available && "cursor-copy")}
        style={{ height: gridH }}
      >
        {/* Fuera de la jornada */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 bg-muted/50" style={{ height: Math.max(0, y(p.settings.startMinute)) }} />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bg-muted/50" style={{ top: y(p.settings.endMinute), height: Math.max(0, gridH - y(p.settings.endMinute)) }} />
        {/* Huecos libres: botones para crear ahí (también con teclado) */}
        {p.available &&
          freeDay?.slots.map((s) => {
            const sMin = zonedParts(new Date(s.start), tz).minutes;
            const eMin = s.endTime === "24:00" ? 1440 : zonedParts(new Date(s.end), tz).minutes;
            return (
              <button
                key={s.start}
                type="button"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clicked = e.detail === 0 ? sMin : sMin + Math.floor(((e.clientY - rect.top) / HOUR) * 2) * 30;
                  openNewAt(day, Math.max(sMin, Math.min(Math.floor(clicked / 30) * 30, eMin - 30)));
                }}
                aria-label={t("freeSlotLabel", { start: s.startTime, end: s.endTime, time: duration(s.minutes) })}
                className="group absolute inset-x-1 rounded-md border border-dashed border-transparent outline-none hover:border-border-strong hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                style={{ top: y(sMin) + 1, height: Math.max(8, y(eMin) - y(sMin) - 2) }}
              >
                <span className="pointer-events-none absolute top-1 left-2 hidden items-center gap-1 text-[11px] text-muted-foreground group-hover:inline-flex group-focus-visible:inline-flex">
                  <Plus className="size-3" aria-hidden /> {duration(s.minutes)}
                </span>
              </button>
            );
          })}
        {occ.map((o) => blockButton(o, p.view === "week", lanes.get(o)))}
        {(postsByDay.get(day) ?? []).map((post) => postChip(post, true))}
        {isToday && nowParts.minutes >= startHour * 60 && nowParts.minutes <= endHour * 60 && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 z-30 flex items-center" style={{ top: y(nowParts.minutes) - 4 }}>
            <span className="size-2 -translate-x-1 rounded-full bg-destructive" />
            <span className="h-px flex-1 bg-destructive" />
          </div>
        )}
      </div>
    );
  };

  const hourGutter = (
    <div aria-hidden className="relative w-12 shrink-0" style={{ height: gridH }}>
      {hours.map((h) => (
        <span key={h} className="absolute right-2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground tabular-nums" style={{ top: y(h * 60) }}>
          {h === startHour ? "" : hhmm(h * 60)}
        </span>
      ))}
    </div>
  );

  const gridLines = (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {hours.map((h) => (
        <div key={h} className="absolute inset-x-0 border-t border-dashed border-border" style={{ top: y(h * 60) }} />
      ))}
    </div>
  );

  const freeLine = (day: string) => {
    const f = freeByDay.get(day);
    if (!f) return null;
    return f.totalMinutes ? t("freeShort", { time: duration(f.totalMinutes) }) : day < p.today ? "" : t("freeNoneShort");
  };

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-5">
      {/* Cabecera */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="label-mono">{t("private")}</p>
          <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setSettingsOpen(true)} disabled={!p.available}>
            <Settings2 /> {t("settings")}
          </Button>
          <Button variant="outline" onClick={() => setPlanOpen(true)} disabled={!p.available}>
            <Wand2 /> {p.view === "day" ? t("planDay") : t("planWeek")}
          </Button>
          <Button onClick={() => openNewAt(newDay, defaultStart(newDay))} disabled={!p.available}>
            <Plus /> {t("newBlock")}
          </Button>
        </div>
      </div>

      {!p.available && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("unavailable")}
        </p>
      )}

      {/* Navegación */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t("viewLabel")} className="inline-flex rounded-md border p-0.5">
          {(["day", "week"] as const).map((v) => (
            <Link
              key={v}
              href={qs(v, p.anchor)}
              aria-current={p.view === v ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-[5px] px-3 text-sm pointer-coarse:min-h-11",
                p.view === v ? "bg-accent font-medium text-foreground shadow-[inset_0_-2px_0_var(--selected)]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "day" ? t("viewDay") : t("viewWeek")}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label={t("prev")}>
            <Link href={qs(p.view, addDays(p.anchor, -step))}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
            <Link href={qs(p.view, p.today)} aria-current={p.days.includes(p.today) ? "date" : undefined}>
              {t("today")}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label={t("next")}>
            <Link href={qs(p.view, addDays(p.anchor, step))}>
              <ChevronRight />
            </Link>
          </Button>
          <h2 className="ml-2 text-sm font-medium first-letter:uppercase" aria-live="polite">
            {rangeLabel}
          </h2>
        </div>
      </div>

      {/* Tiempo libre */}
      {focusFree && !isPast && (
        <section aria-labelledby="free-title" className="surface rounded-xl border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="free-title" className="flex items-center gap-2 text-base font-medium">
              <Clock className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              {focusFree.totalMinutes
                ? focusDay === p.today
                  ? t("freeToday", { time: duration(focusFree.totalMinutes) })
                  : t("freeOn", { date: fmtLong(focusDay), time: duration(focusFree.totalMinutes) })
                : t("freeNone", { start: hhmm(p.settings.startMinute), end: hhmm(p.settings.endMinute) })}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("freeWindow", { start: hhmm(p.settings.startMinute), end: hhmm(p.settings.endMinute) })}
              {focusDay === p.today ? t("fromNow") : ""}
            </p>
          </div>
          {focusFree.slots.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label={t("freeSlotsLabel")}>
              {focusFree.slots.map((s) => (
                <li key={s.start}>
                  <button
                    type="button"
                    disabled={!p.available}
                    onClick={() => openNewAt(focusDay, zonedParts(new Date(s.start), tz).minutes)}
                    aria-label={t("freeSlotLabel", { start: s.startTime, end: s.endTime, time: duration(s.minutes) })}
                    className="inline-flex min-h-9 items-center gap-2 rounded-md border border-dashed px-3 text-sm hover:border-border-strong hover:bg-accent/40 disabled:opacity-60 pointer-coarse:min-h-11"
                  >
                    <span className="font-mono tabular-nums">
                      {s.startTime}–{s.endTime}
                    </span>
                    <span className="text-xs text-muted-foreground">{duration(s.minutes)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{p.available ? t("freeHint") : ""}</p>
        </section>
      )}

      {/* Semana en móvil: lista por días (la rejilla de 7 columnas no cabe en 360 px) */}
      {p.view === "week" && (
        <ol className="space-y-3 md:hidden" aria-label={t("weekListLabel")}>
          {p.days.map((day) => {
            const occ = occByDay.get(day) ?? [];
            const dayPosts = postsByDay.get(day) ?? [];
            return (
              <li key={day} className={cn("surface rounded-xl border p-3", day === p.today && "border-selected")}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <Link href={qs("day", day)} className="text-sm font-medium first-letter:uppercase hover:underline" aria-current={day === p.today ? "date" : undefined}>
                    {fmtLong(day)}
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">{freeLine(day)}</span>
                </div>
                <div className="space-y-1.5">
                  {occ.map((o) => blockButton(o, false))}
                  {dayPosts.length > 0 && <div className="flex flex-wrap gap-1.5">{dayPosts.map((post) => postChip(post, false))}</div>}
                  {!occ.length && !dayPosts.length && <p className="text-xs text-muted-foreground">{t("empty")}</p>}
                </div>
                {p.available && day >= p.today && (
                  <Button variant="ghost" size="sm" className="mt-2 pointer-coarse:min-h-11" onClick={() => openNewAt(day, defaultStart(day))}>
                    <Plus /> {t("add")}
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {/* Rejilla (día: siempre; semana: desde md) */}
      <section aria-label={t("gridLabel")} className={cn("surface overflow-hidden rounded-xl border", p.view === "week" && "hidden md:block")}>
        {p.view === "week" && (
          <div className="flex border-b">
            <div className="w-12 shrink-0" />
            <div className="grid flex-1 grid-cols-7">
              {p.days.map((day) => (
                <Link
                  key={day}
                  href={qs("day", day)}
                  aria-current={day === p.today ? "date" : undefined}
                  className={cn("flex min-h-14 flex-col items-center justify-center border-l px-1 py-1.5 text-center hover:bg-accent/40", day === p.today && "shadow-[inset_0_-2px_0_var(--selected)]")}
                >
                  <span className="label-mono !text-[10px]">{format.dateTime(dayDate(day), { weekday: "short", timeZone: "UTC" }).replace(".", "")}</span>
                  <span className="text-sm font-medium tabular-nums">{format.dateTime(dayDate(day), { day: "numeric", timeZone: "UTC" })}</span>
                  <span className="truncate font-mono text-[10px] text-muted-foreground tabular-nums">{freeLine(day)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
        <div ref={scrollRef} className="max-h-[70vh] overflow-y-auto overscroll-contain">
          <div className="relative flex pt-2 pb-2">
            {hourGutter}
            <div className="relative flex-1">
              {gridLines}
              <div className={cn("relative grid", p.view === "week" ? "grid-cols-7" : "grid-cols-1")}>{p.days.map((day) => dayColumn(day))}</div>
            </div>
          </div>
        </div>
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">{p.available ? t("gridHint") : t("gridHintReadonly")}</p>
      </section>

      <BlockDialog draft={draft} onClose={() => setDraft(null)} projects={p.projects} tasks={tasks} available={p.available} />
      <PlanDialog
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        scope={p.view}
        candidates={p.candidates}
        slots={p.free.filter((f) => f.day >= p.today).flatMap((f) => f.slots)}
        timezone={tz}
        projectColor={colorOf}
        available={p.available}
      />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={p.settings} />
    </div>
  );
}
