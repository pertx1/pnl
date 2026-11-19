"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Link2, RefreshCw, TicketPercent, Trash2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDiscount, createUtmLink, deleteAttribution, disconnect, syncNow, type ShopifyActionResult } from "./actions";

function useErr() {
  const t = useTranslations("commerce.shopify.errors");
  return (r: ShopifyActionResult) => {
    if ("error" in r && r.error) toast.error(t.has(r.error) ? t(r.error) : t("default"));
  };
}

export function StoreActions({ projectId, canEdit, isAdmin, reconnectHref, needsReconnect }: { projectId: string; canEdit: boolean; isAdmin: boolean; reconnectHref: string | null; needsReconnect: boolean }) {
  const t = useTranslations("commerce.shopify");
  const showErr = useErr();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      {needsReconnect && reconnectHref && (
        <Button asChild size="sm">
          <a href={reconnectHref}>{t("reconnect")}</a>
        </Button>
      )}
      {canEdit && (
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await syncNow(projectId);
              if (r.ok) toast.success(t("syncStarted"));
              else showErr(r);
            })
          }
        >
          <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden /> {t("syncNow")}
        </Button>
      )}
      {isAdmin &&
        (confirming ? (
          <div role="group" aria-label={t("disconnect")} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("disconnectConfirm")}</span>
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await disconnect(projectId);
                  if (r.ok) toast.success(t("disconnected"));
                  else showErr(r);
                  setConfirming(false);
                })
              }
            >
              {t("disconnectYes")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              {t("cancel")}
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            <Unplug aria-hidden /> {t("disconnect")}
          </Button>
        ))}
    </div>
  );
}

type PostOption = { id: string; label: string };

function TargetFields({ posts, postId, setPostId, creator, setCreator }: { posts: PostOption[]; postId: string; setPostId: (v: string) => void; creator: string; setCreator: (v: string) => void }) {
  const t = useTranslations("commerce.shopify");
  const id = useId();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-post`}>{t("post")}</Label>
        <select
          id={`${id}-post`}
          value={postId}
          onChange={(e) => setPostId(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <option value="">{t("noPost")}</option>
          {posts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-creator`}>
          {t("creator")} <span className="text-muted-foreground">({t("optional")})</span>
        </Label>
        <Input id={`${id}-creator`} value={creator} onChange={(e) => setCreator(e.target.value)} maxLength={80} placeholder={t("creatorPlaceholder")} />
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const t = useTranslations("commerce.shopify");
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value).catch(() => null);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check aria-hidden /> : <Copy aria-hidden />} {done ? t("copied") : t("copy")}
    </Button>
  );
}

export function AttributionForms({ projectId, posts, defaultDestination }: { projectId: string; posts: PostOption[]; defaultDestination: string }) {
  const t = useTranslations("commerce.shopify");
  const showErr = useErr();
  const [mode, setMode] = useState<"utm" | "discount">("utm");
  const [postId, setPostId] = useState("");
  const [creator, setCreator] = useState("");
  const [destination, setDestination] = useState(defaultDestination);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState(10);
  const [endsAt, setEndsAt] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = useId();
  const missingTarget = !postId && !creator.trim();

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div role="group" aria-label={t("attribution")} className="inline-flex gap-1 rounded-full border p-1">
        {(["utm", "discount"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              setResult(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {m === "utm" ? <Link2 className="size-3.5" aria-hidden /> : <TicketPercent className="size-3.5" aria-hidden />}
            {m === "utm" ? t("newUtm") : t("newDiscount")}
          </button>
        ))}
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (missingTarget) return;
          start(async () => {
            const target = { projectId, postId: postId || null, creator: creator.trim() || null };
            const r = mode === "utm" ? await createUtmLink({ ...target, destination }) : await createDiscount({ ...target, code, percent, endsAt: endsAt || null });
            if (r.ok) {
              setResult(r.url ?? r.code ?? null);
              toast.success(mode === "utm" ? t("utmCreated") : t("discountCreated"));
              setCode("");
            } else showErr(r);
          });
        }}
      >
        <TargetFields posts={posts} postId={postId} setPostId={setPostId} creator={creator} setCreator={setCreator} />
        {mode === "utm" ? (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-dest`}>{t("destination")}</Label>
            <Input id={`${id}-dest`} type="url" required value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="https://" />
            <p className="text-xs text-muted-foreground">{t("utmHint")}</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-code`}>{t("code")}</Label>
              <Input id={`${id}-code`} required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={40} pattern="[A-Za-z0-9_\-]{3,40}" placeholder="ANA10" className="font-mono uppercase" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-pct`}>{t("percent")}</Label>
              <Input id={`${id}-pct`} type="number" min={1} max={90} required value={percent} onChange={(e) => setPercent(Number(e.target.value))} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-end`}>
                {t("endsAt")} <span className="text-muted-foreground">({t("optional")})</span>
              </Label>
              <Input id={`${id}-end`} type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-3">{t("discountHint")}</p>
          </div>
        )}
        {missingTarget && <p className="text-xs text-muted-foreground">{t("targetRequired")}</p>}
        <Button type="submit" disabled={pending || missingTarget}>
          {pending ? t("creating") : mode === "utm" ? t("createUtm") : t("createDiscount")}
        </Button>
      </form>

      {result && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-success/40 bg-success/10 p-3">
          <code className="min-w-0 flex-1 truncate font-mono text-xs">{result}</code>
          <CopyButton value={result} />
        </div>
      )}
    </div>
  );
}

export function DeleteAttributionButton({ projectId, id }: { projectId: string; id: string }) {
  const t = useTranslations("commerce.shopify");
  const showErr = useErr();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("removeRule")}
      title={t("removeRuleHint")}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await deleteAttribution(projectId, id);
          if (!r.ok) showErr(r);
        })
      }
    >
      <Trash2 aria-hidden />
    </Button>
  );
}
