"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { approveConsent, denyConsent, type ConsentResult } from "./actions";

export function ConsentForm({ workspaces, digest }: { workspaces: { id: string; name: string; role: string }[]; digest: string }) {
  const t = useTranslations("mcpOAuth.consent");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [error, setError] = useState<ConsentResult["error"] | null>(null);
  const [pending, start] = useTransition();
  const id = useId();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await approveConsent(workspaceId, digest);
          if (r?.error) setError(r.error);
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={id}>{t("workspace")}</Label>
        <select
          id={id}
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-describedby={`${id}-help`}
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} — {t("role", { role: w.role })}
            </option>
          ))}
        </select>
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {t("workspaceHelp")}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => void (await denyConsent(digest)))}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending || !workspaceId}>
          {pending ? t("allowing") : t("allow")}
        </Button>
      </div>
    </form>
  );
}
