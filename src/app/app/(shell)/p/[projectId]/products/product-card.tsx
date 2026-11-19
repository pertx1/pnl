"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Calculator, ExternalLink, Loader2, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AiBadge } from "@/components/kreo/ai-badge";
import { CreditCost } from "@/components/kreo/credit-cost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProductAnalysis } from "@/lib/agents/cazador";
import { computeMargin } from "@/lib/research/margin";
import type { ScoreFactor } from "@/lib/research/score";
import { cn } from "@/lib/utils";
import { useResearchError } from "../competitors/_components/shared";
import { analyzeProductAction, deleteProduct, updateProduct } from "./actions";
import { ScoreBadge, ScoreFactors } from "./score-view";

export type ProductView = {
  id: string;
  title: string;
  notes: string;
  supplierUrl: string | null;
  listId: string | null;
  source: "manual" | "meta_ad_library";
  pageName: string | null;
  libraryUrl: string | null;
  adText: string | null;
  score: number | null;
  factors: ScoreFactor[];
  currency: string;
  salePrice: number | null;
  unitCost: number | null;
  shippingCost: number | null;
  feePct: number | null;
  cpa: number | null;
  analysis: { result: ProductAnalysis; createdAt: string } | null;
};

const toNum = (s: string) => (s.trim() === "" ? null : Math.max(0, Number(s.replace(",", "."))));
const toStr = (n: number | null) => (n === null ? "" : String(n));

export function ProductCard({
  product,
  lists,
  canEdit,
  aiEnabled,
  credits,
  balance,
}: {
  product: ProductView;
  lists: { id: string; name: string }[];
  canEdit: boolean;
  aiEnabled: boolean;
  credits: number;
  balance: number;
}) {
  const t = useTranslations("products.card");
  const format = useFormatter();
  const errorText = useResearchError();
  const [title, setTitle] = useState(product.title);
  const [notes, setNotes] = useState(product.notes);
  const [supplier, setSupplier] = useState(product.supplierUrl ?? "");
  const [listId, setListId] = useState(product.listId ?? "");
  const [currency, setCurrency] = useState(product.currency);
  const [m, setM] = useState({
    salePrice: toStr(product.salePrice),
    unitCost: toStr(product.unitCost),
    shippingCost: toStr(product.shippingCost),
    feePct: toStr(product.feePct),
    cpa: toStr(product.cpa),
  });
  const [analysis, setAnalysis] = useState(product.analysis);
  const [busy, start] = useTransition();
  const [aiBusy, startAi] = useTransition();
  const [open, setOpen] = useState(false);

  const nums = { salePrice: toNum(m.salePrice), unitCost: toNum(m.unitCost), shippingCost: toNum(m.shippingCost), feePct: toNum(m.feePct), cpa: toNum(m.cpa) };
  const valid = Object.values(nums).every((v) => v === null || Number.isFinite(v)) && (nums.feePct ?? 0) <= 100;
  const result = useMemo(
    () =>
      nums.salePrice
        ? computeMargin({ salePrice: nums.salePrice, unitCost: nums.unitCost ?? 0, shipping: nums.shippingCost ?? 0, feePct: nums.feePct ?? 0, cpa: nums.cpa ?? 0 })
        : null,
    [nums.salePrice, nums.unitCost, nums.shippingCost, nums.feePct, nums.cpa],
  );
  const money = (v: number) => format.number(v, { style: "currency", currency });

  function save() {
    if (!valid) return toast.error(errorText("invalid_input"));
    start(async () => {
      const r = await updateProduct({ productId: product.id, title, notes, supplierUrl: supplier, listId: listId || null, currency, ...nums });
      if (r.ok) toast.success(t("saved"));
      else toast.error(errorText(r.error));
    });
  }

  const field = (key: keyof typeof m, label: string, suffix?: string) => (
    <div className="space-y-1">
      <Label htmlFor={`${product.id}-${key}`} className="text-xs">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={`${product.id}-${key}`}
          inputMode="decimal"
          value={m[key]}
          onChange={(e) => setM((s) => ({ ...s, [key]: e.target.value }))}
          className="pr-10 font-mono tabular-nums"
          disabled={!canEdit}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{suffix ?? currency}</span>
      </div>
    </div>
  );

  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          {canEdit ? (
            <Input aria-label={t("title")} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="h-8 font-medium" />
          ) : (
            <h3 className="font-medium">{title}</h3>
          )}
          <p className="text-xs text-muted-foreground">
            {product.source === "meta_ad_library" ? t("fromLibrary", { page: product.pageName ?? "—" }) : t("manual")}
          </p>
        </div>
        <ScoreBadge score={product.score} />
      </header>

      {product.factors.length > 0 && <ScoreFactors factors={product.factors} />}
      {product.adText && <p className="line-clamp-3 text-xs whitespace-pre-line text-muted-foreground">{product.adText}</p>}

      <div className="flex flex-wrap gap-2">
        {product.libraryUrl && (
          <Button asChild size="xs" variant="outline">
            <a href={product.libraryUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> {t("adLibrary")}
            </a>
          </Button>
        )}
        {supplier && /^https:\/\//.test(supplier) && (
          <Button asChild size="xs" variant="outline">
            <a href={supplier} target="_blank" rel="noopener noreferrer nofollow">
              <ExternalLink /> {t("supplier")}
            </a>
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${product.id}-supplier`} className="text-xs">
            {t("supplierUrl")}
          </Label>
          <Input id={`${product.id}-supplier`} type="url" placeholder="https://" value={supplier} maxLength={2000} onChange={(e) => setSupplier(e.target.value)} disabled={!canEdit} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${product.id}-list`} className="text-xs">
            {t("list")}
          </Label>
          <select
            id={`${product.id}-list`}
            className="w-full rounded-md border border-input bg-transparent px-2 py-2 text-sm"
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            disabled={!canEdit}
          >
            <option value="">{t("noList")}</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${product.id}-notes`} className="text-xs">
          {t("notes")}
        </Label>
        <Textarea id={`${product.id}-notes`} rows={2} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} />
      </div>

      <details className="rounded-md border p-3" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <Calculator className="size-4" aria-hidden /> {t("calculator")}
          {result && (
            <span className={cn("ml-auto font-mono text-xs tabular-nums", result.margin >= 0 ? "text-success" : "text-destructive")}>
              {money(result.margin)} {result.marginPct !== null && `· ${format.number(result.marginPct, { maximumFractionDigits: 1 })} %`}
            </span>
          )}
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {field("salePrice", t("salePrice"))}
            {field("unitCost", t("unitCost"))}
            {field("shippingCost", t("shipping"))}
            {field("feePct", t("fee"), "%")}
            {field("cpa", t("cpa"))}
            <div className="space-y-1">
              <Label htmlFor={`${product.id}-cur`} className="text-xs">
                {t("currency")}
              </Label>
              <select id={`${product.id}-cur`} className="w-full rounded-md border border-input bg-transparent px-2 py-2 text-sm" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={!canEdit}>
                {["EUR", "USD", "GBP"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          {result ? (
            <dl className="grid grid-cols-2 gap-2 rounded-md bg-secondary p-3 text-xs md:grid-cols-4" aria-live="polite">
              <Stat label={t("margin")} value={money(result.margin)} tone={result.margin >= 0 ? "good" : "bad"} />
              <Stat label={t("marginPct")} value={result.marginPct === null ? "—" : `${format.number(result.marginPct, { maximumFractionDigits: 1 })} %`} tone={result.margin >= 0 ? "good" : "bad"} />
              <Stat label={t("breakEvenCpa")} value={money(result.breakEvenCpa)} />
              <Stat label={t("breakEvenRoas")} value={result.breakEvenRoas === null ? "—" : `${format.number(result.breakEvenRoas, { maximumFractionDigits: 2 })}×`} />
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">{t("calculatorHint")}</p>
          )}
        </div>
      </details>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Save />} {t("save")}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(t("deleteConfirm"))) return;
              start(async () => {
                const r = await deleteProduct(product.id);
                if (!r.ok) toast.error(errorText(r.error));
              });
            }}
          >
            <Trash2 /> {t("delete")}
          </Button>
        </div>
      )}

      <div className="space-y-2 border-t pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="brand"
            disabled={!aiEnabled || !canEdit || aiBusy || balance < credits}
            onClick={() =>
              startAi(async () => {
                const r = await analyzeProductAction(product.id);
                if (r.ok) setAnalysis({ result: r.data, createdAt: new Date().toISOString() });
                else toast.error(errorText(r.error));
              })
            }
          >
            {aiBusy ? <Loader2 className="animate-spin" /> : <Sparkles />} {t("analyze")}
          </Button>
          <CreditCost credits={credits} />
          {!aiEnabled && <span className="text-xs text-muted-foreground">{t("aiNotConfigured")}</span>}
        </div>
        {analysis && <AnalysisView a={analysis.result} />}
      </div>
    </article>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <dt className="label-mono !text-[9px]">{label}</dt>
      <dd className={cn("font-mono text-sm tabular-nums", tone === "good" && "text-success", tone === "bad" && "text-destructive")}>{value}</dd>
    </div>
  );
}

function AnalysisView({ a }: { a: ProductAnalysis }) {
  const t = useTranslations("products.analysis");
  return (
    <div className="space-y-2 text-sm" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <AiBadge />
        <span
          className={cn(
            "rounded-sm px-1.5 py-0.5 text-xs font-semibold",
            a.verdict === "test" ? "bg-primary text-primary-foreground" : a.verdict === "maybe" ? "bg-warning/15 text-warning" : "bg-destructive/10 text-destructive",
          )}
        >
          {t(`verdict.${a.verdict}`)}
        </span>
      </div>
      <p>{a.summary}</p>
      <List title={t("why")} items={a.whyItSells} />
      <List title={t("angles")} items={a.angles.map((x) => `${x.angle} — “${x.hook}”`)} />
      <p>
        <span className="label-mono mr-2">{t("audience")}</span>
        {a.audience}
      </p>
      <p>
        <span className="label-mono mr-2">{t("margin")}</span>
        {a.marginComment}
      </p>
      <List title={t("risks")} items={a.risks} />
      <List title={t("next")} items={a.nextSteps} />
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="label-mono">{title}</p>
      <ul className="list-disc space-y-0.5 pl-5">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
