"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ReadScope } from "@/lib/inbox/read-state";
import { markAllRead } from "./actions";

/**
 * «Marcar como leído»: todo o por canal (DMs de Instagram, comentarios, Gmail, Outlook). Solo cambia el estado en Kreo
 * (ver src/lib/inbox/read-state.ts). Cada opción muestra cuántos quedan sin leer.
 */
export function MarkAllRead({ projectId, options }: { projectId: string; options: { scope: ReadScope; count: number }[] }) {
  const t = useTranslations("inbox");
  const router = useRouter();
  const [busy, start] = useTransition();
  if (!options.length) return null;
  const run = (scope: ReadScope) =>
    start(async () => {
      const res = await markAllRead(projectId, scope);
      if (!res.ok) {
        toast.error(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : t("errors.default"));
        return;
      }
      toast.success(t("markRead.done", { count: res.data ?? 0 }));
      router.refresh();
    });

  return (
    <div role="group" aria-label={t("markRead.label")} className="flex flex-wrap items-center gap-1.5">
      <span className="label-mono mr-1">{t("markRead.label")}</span>
      {options.map((o) => (
        <Button
          key={o.scope}
          type="button"
          variant={o.scope === "all" ? "secondary" : "ghost"}
          size="sm"
          className="rounded-full"
          disabled={busy || o.count === 0}
          onClick={() => run(o.scope)}
        >
          {o.scope === "all" && <CheckCheck aria-hidden />}
          {t(`markRead.scopes.${o.scope}`)}
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{o.count}</span>
        </Button>
      ))}
    </div>
  );
}
