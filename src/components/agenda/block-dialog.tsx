"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createAgendaBlock, deleteAgendaBlock, updateAgendaBlock, type AgendaActionResult } from "@/app/app/(shell)/agenda/actions";
import { TerminalCursor } from "@/components/brand/terminal-cursor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AGENDA_KINDS, hhmm, isoWeekday, type AgendaKind } from "@/lib/agenda/core";
import type { AgendaBlockRow } from "@/lib/supabase/types/agenda";
import { cn } from "@/lib/utils";
import { KIND_STYLE } from "./kinds";

export type BlockDraft =
  | { mode: "new"; day: string; start: number; end: number; kind?: AgendaKind; title?: string; projectId?: string | null }
  | { mode: "edit"; day: string; block: AgendaBlockRow };

export type LinkOption = { id: string; name: string };
export type TaskOption = { id: string; title: string; projectId: string | null };

const selectCls =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-black/20";

/** Crear o editar un bloque: pocos campos, recurrencia con chips de días y borrado de un día o de toda la serie. */
export function BlockDialog({
  draft,
  onClose,
  projects,
  tasks,
  available,
}: {
  draft: BlockDraft | null;
  onClose: () => void;
  projects: LinkOption[];
  tasks: TaskOption[];
  available: boolean;
}) {
  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {draft && <BlockForm key={draft.mode === "edit" ? `${draft.block.id}-${draft.day}` : `new-${draft.day}-${draft.start}`} draft={draft} onClose={onClose} projects={projects} tasks={tasks} available={available} />}
      </DialogContent>
    </Dialog>
  );
}

function BlockForm({ draft, onClose, projects, tasks, available }: { draft: BlockDraft; onClose: () => void; projects: LinkOption[]; tasks: TaskOption[]; available: boolean }) {
  const t = useTranslations("agenda");
  const uid = useId();
  const [pending, start] = useTransition();
  const b = draft.mode === "edit" ? draft.block : null;
  const [title, setTitle] = useState(b?.title ?? (draft.mode === "new" ? (draft.title ?? "") : ""));
  const [kind, setKind] = useState<AgendaKind>(b?.kind ?? (draft.mode === "new" ? (draft.kind ?? "work") : "work"));
  const [day, setDay] = useState(b?.start_day ?? draft.day);
  const [startTime, setStartTime] = useState(hhmm(b?.start_minute ?? (draft.mode === "new" ? draft.start : 540)));
  const [endTime, setEndTime] = useState(hhmm(b?.end_minute ?? (draft.mode === "new" ? draft.end : 600)));
  const [repeat, setRepeat] = useState((b?.repeat_days.length ?? 0) > 0);
  const [repeatDays, setRepeatDays] = useState<number[]>(b?.repeat_days.length ? b.repeat_days : [isoWeekday(draft.day)]);
  const [until, setUntil] = useState(b?.end_day && b.repeat_days.length ? b.end_day : "");
  const [projectId, setProjectId] = useState(b?.project_id ?? (draft.mode === "new" ? (draft.projectId ?? "") : ""));
  const [taskId, setTaskId] = useState(b?.task_id ?? "");
  const [note, setNote] = useState(b?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const recurring = (b?.repeat_days.length ?? 0) > 0;
  const projectTasks = tasks.filter((x) => x.projectId === projectId || x.id === taskId);

  const handle = (res: AgendaActionResult, okMsg: string) => {
    if (res.ok) {
      toast.success(okMsg);
      onClose();
    } else setError(t(`errors.${res.error}`));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const input = {
      title,
      kind,
      note,
      day,
      start: startTime,
      end: endTime === "00:00" ? "24:00" : endTime,
      repeatDays: repeat ? repeatDays : [],
      repeatUntil: repeat && until ? until : null,
      projectId: projectId || null,
      taskId: taskId && projectId ? taskId : null,
      postId: b?.post_id ?? null,
    };
    start(async () => handle(b ? await updateAgendaBlock(b.id, input) : await createAgendaBlock(input), t("toastSaved")));
  };

  const remove = (scope: "one" | "all") => {
    if (!b) return;
    start(async () => handle(await deleteAgendaBlock(b.id, scope, draft.day), t("toastDeleted")));
  };

  const errId = `${uid}-err`;
  return (
    <form onSubmit={submit} className="grid gap-4" aria-describedby={error ? errId : undefined}>
      <DialogHeader>
        <DialogTitle>{b ? t("editTitle") : t("newTitle")}</DialogTitle>
        <DialogDescription>{t("privateNote")}</DialogDescription>
      </DialogHeader>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">{t("fieldTitle")}</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} maxLength={120} required autoFocus />
      </label>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">{t("fieldKind")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {AGENDA_KINDS.map((k) => {
            const S = KIND_STYLE[k];
            const checked = kind === k;
            return (
              <label
                key={k}
                className={cn(
                  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50 pointer-coarse:min-h-11",
                  checked ? "border-selected bg-accent font-medium text-foreground" : "text-muted-foreground hover:border-border-strong hover:text-foreground",
                )}
              >
                <input type="radio" name={`${uid}-kind`} value={k} checked={checked} onChange={() => setKind(k)} className="sr-only" />
                <S.icon className={cn("size-3.5", S.text)} strokeWidth={1.5} aria-hidden />
                {t(`kinds.${k}`)}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="col-span-2 grid gap-1.5 sm:col-span-1">
          <span className="text-sm font-medium">{t("fieldDay")}</span>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">{t("fieldStart")}</span>
          <Input type="time" step={300} value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">{t("fieldEnd")}</span>
          <Input type="time" step={300} value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
        </label>
      </div>

      <div className="grid gap-3 rounded-lg border p-3">
        <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm font-medium pointer-coarse:min-h-11">
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="size-4 accent-[var(--selected)]" />
          <Repeat className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          {t("repeat")}
        </label>
        {repeat && (
          <>
            <fieldset>
              <legend className="mb-1.5 text-sm text-muted-foreground">{t("repeatDays")}</legend>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                  const on = repeatDays.includes(d);
                  return (
                    <label
                      key={d}
                      className={cn(
                        "grid size-9 cursor-pointer place-items-center rounded-md border font-mono text-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50 pointer-coarse:size-11",
                        on ? "border-selected bg-accent font-semibold text-foreground" : "text-muted-foreground hover:border-border-strong",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        aria-label={t(`wdLong.${d}`)}
                        onChange={(e) => setRepeatDays((prev) => (e.target.checked ? [...prev, d] : prev.filter((x) => x !== d)))}
                      />
                      <span aria-hidden>{t(`wd.${d}`)}</span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button type="button" className="link min-h-9 pointer-coarse:min-h-11" onClick={() => setRepeatDays([1, 2, 3, 4, 5])}>
                  {t("presetWeekdays")}
                </button>
                <button type="button" className="link min-h-9 pointer-coarse:min-h-11" onClick={() => setRepeatDays([1, 2, 3, 4, 5, 6, 7])}>
                  {t("presetEveryday")}
                </button>
              </div>
            </fieldset>
            <label className="grid gap-1.5 sm:max-w-56">
              <span className="text-sm text-muted-foreground">{t("repeatUntil")}</span>
              <Input type="date" value={until} min={day} onChange={(e) => setUntil(e.target.value)} />
            </label>
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">{t("project")}</span>
          <select className={selectCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t("noProject")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {projectId && projectTasks.length > 0 && (
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">{t("task")}</span>
            <select className={selectCls} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">{t("noTask")}</option>
              {projectTasks.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">{t("note")}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={2}
          className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-black/20"
        />
      </label>

      {error && (
        <p id={errId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter className="sm:justify-between">
        {b ? (
          <div className="flex flex-wrap gap-2">
            {recurring ? (
              <>
                <Button type="button" variant="destructive" disabled={pending || !available} onClick={() => remove("one")}>
                  <Trash2 /> {t("deleteOne")}
                </Button>
                <Button type="button" variant="destructive" disabled={pending || !available} onClick={() => remove("all")}>
                  {t("deleteAll")}
                </Button>
              </>
            ) : (
              <Button type="button" variant="destructive" disabled={pending || !available} onClick={() => remove("all")}>
                <Trash2 /> {t("delete")}
              </Button>
            )}
          </div>
        ) : (
          <span />
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={pending || !available} aria-busy={pending}>
            {pending && <TerminalCursor />}
            {t("save")}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
