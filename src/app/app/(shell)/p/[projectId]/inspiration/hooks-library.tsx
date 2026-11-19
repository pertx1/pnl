"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Loader2, Plus, Quote, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AiBadge } from "@/components/kreo/ai-badge";
import { CreditCost } from "@/components/kreo/credit-cost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useResearchError } from "../competitors/_components/shared";
import { addHook, deleteHook, generateHooksAction } from "./actions";

export type HookView = { id: string; text: string; niche: string; format: string; source: "user" | "ai" };

export const HOOK_FORMATS = ["short_video", "carousel", "reel", "long_video", "ad", "post", "email"] as const;
const selectCls = "w-full rounded-md border border-input bg-transparent px-2 py-2 text-sm";

export function HooksLibrary({
  projectId,
  hooks,
  niches,
  filters,
  canEdit,
  aiEnabled,
  credits,
  balance,
}: {
  projectId: string;
  hooks: HookView[];
  niches: string[];
  filters: { niche?: string; format?: string };
  canEdit: boolean;
  aiEnabled: boolean;
  credits: number;
  balance: number;
}) {
  const t = useTranslations("inspiration.hooks");
  const errorText = useResearchError();
  const [niche, setNiche] = useState(filters.niche ?? "");
  const [format, setFormat] = useState<string>(filters.format ?? "short_video");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState<string>();
  const [busy, start] = useTransition();
  const base = `/app/p/${projectId}/inspiration`;
  const fmtLabel = (f: string) => ((HOOK_FORMATS as readonly string[]).includes(f) ? t(`formats.${f}`) : f || "—");

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ tab: "hooks" });
    for (const [k, v] of Object.entries({ ...filters, ...patch })) if (v) p.set(k, v);
    return `${base}?${p}`;
  };
  const chip = (on: boolean) => cn("rounded-full border px-3 py-1 text-xs", on ? "border-selected bg-primary/10 font-semibold" : "hover:bg-accent");

  async function copy(h: HookView) {
    try {
      await navigator.clipboard.writeText(h.text);
      setCopied(h.id);
      toast.success(t("copied"));
      setTimeout(() => setCopied((c) => (c === h.id ? undefined : c)), 1500);
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  return (
    <div className="space-y-5">
      {canEdit && (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="hook-niche">{t("niche")}</Label>
              <Input id="hook-niche" list="hook-niches" placeholder={t("nichePlaceholder")} value={niche} maxLength={80} onChange={(e) => setNiche(e.target.value)} />
              <datalist id="hook-niches">
                {niches.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <Label htmlFor="hook-format">{t("format")}</Label>
              <select id="hook-format" className={selectCls} value={format} onChange={(e) => setFormat(e.target.value)}>
                {HOOK_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {t(`formats.${f}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="brand"
              disabled={busy || !aiEnabled || niche.trim().length < 2 || balance < credits}
              onClick={() =>
                start(async () => {
                  const r = await generateHooksAction({ projectId, niche, format });
                  if (r.ok) toast.success(t("generated", { count: r.count }));
                  else toast.error(errorText(r.error));
                })
              }
            >
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {t("generate")}
            </Button>
            <CreditCost credits={credits} />
            {!aiEnabled && <span className="text-xs text-muted-foreground">{t("aiNotConfigured")}</span>}
          </div>
          <form
            className="flex flex-col gap-2 border-t pt-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await addHook({ projectId, text, niche, format });
                if (r.ok) setText("");
                else toast.error(errorText(r.error));
              });
            }}
          >
            <Input aria-label={t("own")} placeholder={t("ownPlaceholder")} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} />
            <Button type="submit" variant="secondary" disabled={busy || text.trim().length < 3} className="shrink-0">
              <Plus /> {t("save")}
            </Button>
          </form>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("filterNiche")}>
          <Link href={href({ niche: undefined })} className={chip(!filters.niche)}>
            {t("allNiches")}
          </Link>
          {niches.map((n) => (
            <Link key={n} href={href({ niche: n })} className={chip(filters.niche === n)} aria-current={filters.niche === n ? "true" : undefined}>
              {n}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("filterFormat")}>
          <Link href={href({ format: undefined })} className={chip(!filters.format)}>
            {t("allFormats")}
          </Link>
          {HOOK_FORMATS.map((f) => (
            <Link key={f} href={href({ format: f })} className={chip(filters.format === f)} aria-current={filters.format === f ? "true" : undefined}>
              {t(`formats.${f}`)}
            </Link>
          ))}
        </div>
      </div>

      {hooks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
          <Quote className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          <p className="font-medium">{t("empty.title")}</p>
          <p className="max-w-md text-sm text-muted-foreground">{t("empty.body")}</p>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {hooks.map((h) => (
            <li key={h.id} className="flex items-start gap-3 p-3">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm">{h.text}</p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {h.niche && <span>{h.niche}</span>}
                  <span className="label-mono !text-[9px]">{fmtLabel(h.format)}</span>
                  {h.source === "ai" && <AiBadge />}
                </p>
              </div>
              <Button size="icon-sm" variant="ghost" onClick={() => copy(h)} aria-label={t("copy")}>
                {copied === h.id ? <Check className="text-success" /> : <Copy />}
              </Button>
              {canEdit && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("delete")}
                  disabled={busy}
                  onClick={() =>
                    start(async () => {
                      const r = await deleteHook(h.id);
                      if (!r.ok) toast.error(errorText(r.error));
                    })
                  }
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
