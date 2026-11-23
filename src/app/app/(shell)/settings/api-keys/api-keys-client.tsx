"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, KeyRound, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { createApiKey, revokeApiKey, revokeConnectedApp, setCreditPolicy } from "./actions";

export function CopyField({ label, value, mono, multiline }: { label?: string; value: string; mono?: boolean; multiline?: boolean }) {
  const t = useTranslations("commerce.apiKeys");
  const [done, setDone] = useState(false);
  const id = useId();
  return (
    <div className="space-y-1.5">
      {label && (
        <Label htmlFor={id} className="label-mono font-normal">
          {label}
        </Label>
      )}
      <div className="flex items-start gap-2">
        {multiline ? (
          <pre id={id} className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-secondary/40 p-2 font-mono text-xs">
            {value}
          </pre>
        ) : (
          <Input id={id} readOnly value={value} className={cn("min-w-0 flex-1", mono !== false && "font-mono text-xs")} onFocus={(e) => e.currentTarget.select()} />
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={done ? t("copied") : t("copy")}
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => null);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
        >
          {done ? <Check aria-hidden /> : <Copy aria-hidden />}
        </Button>
      </div>
    </div>
  );
}

export function CreateKeyForm() {
  const t = useTranslations("commerce.apiKeys");
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = useId();

  return (
    <div className="space-y-3">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createApiKey(name);
            if (r.ok && r.key) {
              setCreated(r.key);
              setName("");
            } else toast.error(t(`errors.${"error" in r && r.error === "too_many_keys" ? "too_many_keys" : "generic"}`));
          });
        }}
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={id}>{t("name")}</Label>
          <Input id={id} required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
        </div>
        <Button type="submit" disabled={pending || !name.trim()}>
          <KeyRound aria-hidden /> {pending ? t("creating") : t("create")}
        </Button>
      </form>
      {created && (
        <div role="status" className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
            <TriangleAlert className="size-4" aria-hidden /> {t("showOnce")}
          </p>
          <CopyField value={created} />
          <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>
            {t("done")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function RevokeKeyButton({ id, name }: { id: string; name: string }) {
  const t = useTranslations("commerce.apiKeys");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  if (!confirming)
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-label={t("revokeNamed", { name })}>
        {t("revoke")}
      </Button>
    );
  return (
    <div role="group" aria-label={t("revokeNamed", { name })} className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{t("revokeConfirm")}</span>
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await revokeApiKey(id);
            if (r.ok) toast.success(t("revoked"));
            else toast.error(t("errors.generic"));
            setConfirming(false);
          })
        }
      >
        {t("revokeYes")}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        {t("cancel")}
      </Button>
    </div>
  );
}

export function RevokeAppButton({ id, name }: { id: string; name: string }) {
  const t = useTranslations("mcpOAuth.apps");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  if (!confirming)
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-label={t("revokeNamed", { name })}>
        {t("revoke")}
      </Button>
    );
  return (
    <div role="group" aria-label={t("revokeNamed", { name })} className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{t("revokeConfirm")}</span>
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await revokeConnectedApp(id);
            if (r.ok) toast.success(t("revoked"));
            else toast.error(t("error"));
            setConfirming(false);
          })
        }
      >
        {t("revokeYes")}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        {t("cancel")}
      </Button>
    </div>
  );
}

/** Interruptor «permitir gastar créditos» + tope diario de una conexión MCP (app OAuth o API key). */
export function CreditPolicy({ kind, id, allow, cap, usedToday }: { kind: "oauth" | "api_key"; id: string; allow: boolean; cap: number; usedToday: number }) {
  const t = useTranslations("mcpOAuth.credits");
  const [on, setOn] = useState(allow);
  const [value, setValue] = useState(String(cap));
  const [pending, start] = useTransition();
  const switchId = useId();
  const capId = useId();
  const helpId = useId();
  const save = (nextOn: boolean, nextCap: string) =>
    start(async () => {
      const n = Math.max(0, Math.min(100000, Math.floor(Number(nextCap) || 0)));
      const r = await setCreditPolicy(kind, id, nextOn, n);
      if (r.ok) toast.success(t("saved"));
      else {
        toast.error(t("error"));
        setOn(allow);
      }
    });
  return (
    <div className="mt-2 flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-secondary/30 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <Switch
          id={switchId}
          size="sm"
          checked={on}
          disabled={pending}
          aria-describedby={helpId}
          onCheckedChange={(v) => {
            setOn(v);
            save(v, value);
          }}
        />
        <Label htmlFor={switchId} className="text-xs font-medium">
          {t("label")}
        </Label>
      </div>
      {on && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save(on, value);
          }}
        >
          <Label htmlFor={capId} className="text-xs font-normal text-muted-foreground">
            {t("cap")}
          </Label>
          <Input id={capId} type="number" inputMode="numeric" min={0} max={100000} step={1} value={value} onChange={(e) => setValue(e.target.value)} className="h-7 w-20 text-xs" />
          <span className="text-muted-foreground">{t("capUnit")}</span>
          <Button type="submit" variant="outline" size="sm" disabled={pending || value === String(cap)}>
            {t("save")}
          </Button>
          <span className="text-muted-foreground tabular-nums">{t("usedToday", { used: usedToday, cap })}</span>
        </form>
      )}
      <p id={helpId} className={cn("w-full text-muted-foreground", on && "sr-only")}>
        {t("help")}
      </p>
    </div>
  );
}
