"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useResearchError } from "../competitors/_components/shared";
import { createList, deleteList } from "./actions";

export function ListsBar({
  projectId,
  lists,
  active,
  canEdit,
}: {
  projectId: string;
  lists: { id: string; name: string; count: number }[];
  active: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations("products.lists");
  const errorText = useResearchError();
  const [name, setName] = useState("");
  const [busy, start] = useTransition();
  const base = `/app/p/${projectId}/products`;
  const chip = (on: boolean) => cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs", on ? "border-primary bg-primary/10 font-semibold" : "hover:bg-accent");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav aria-label={t("label")} className="flex flex-wrap gap-2">
        <Link href={base} className={chip(!active)} aria-current={!active ? "page" : undefined}>
          {t("all")}
        </Link>
        {lists.map((l) => (
          <span key={l.id} className={chip(active === l.id)}>
            <Link href={`${base}?list=${l.id}`} aria-current={active === l.id ? "page" : undefined}>
              {l.name} <span className="font-mono text-muted-foreground">{l.count}</span>
            </Link>
            {canEdit && (
              <button
                type="button"
                aria-label={t("delete", { name: l.name })}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (!window.confirm(t("deleteConfirm", { name: l.name }))) return;
                  start(async () => {
                    const r = await deleteList(l.id);
                    if (!r.ok) toast.error(errorText(r.error));
                  });
                }}
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
      </nav>
      {canEdit && (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            start(async () => {
              const r = await createList(projectId, name);
              if (r.ok) setName("");
              else toast.error(errorText(r.error));
            });
          }}
        >
          <Input aria-label={t("new")} placeholder={t("new")} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-7 w-36 text-xs" />
          <Button type="submit" size="icon-sm" variant="secondary" disabled={busy || !name.trim()} aria-label={t("create")}>
            <Plus />
          </Button>
        </form>
      )}
    </div>
  );
}
