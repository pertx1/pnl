"use client";

import { useState, useTransition } from "react";
import { TerminalCursor } from "@/components/brand/terminal-cursor";
import { useFormatter, useTranslations } from "next-intl";
import {Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AiBadge } from "@/components/kreo/ai-badge";
import { CreditCost } from "@/components/kreo/credit-cost";
import { Button } from "@/components/ui/button";
import type { CompetitorAnalysis } from "@/lib/agents/analista";
import { analyzeCompetitorAction } from "../actions";
import { useResearchError } from "./shared";

export function CompetitorAnalysisPanel({
  competitorId,
  credits,
  balance,
  enabled,
  initial,
}: {
  competitorId: string;
  credits: number;
  balance: number;
  /** Editor + IA configurada + hay publicaciones. */
  enabled: boolean;
  initial: { result: CompetitorAnalysis; createdAt: string } | null;
}) {
  const t = useTranslations("competitors.analysis");
  const format = useFormatter();
  const errorText = useResearchError();
  const [data, setData] = useState(initial);
  const [busy, start] = useTransition();
  const canPay = balance >= credits;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="brand"
          disabled={!enabled || !canPay || busy}
          onClick={() =>
            start(async () => {
              const r = await analyzeCompetitorAction(competitorId);
              if (r.ok) setData({ result: r.data, createdAt: new Date().toISOString() });
              else toast.error(errorText(r.error));
            })
          }
        >
          {busy ? <TerminalCursor /> : <Sparkles />} {data ? t("rerun") : t("run")}
        </Button>
        <CreditCost credits={credits} />
        {!canPay && <span className="text-xs text-destructive">{t("noCredits")}</span>}
      </div>

      {data ? (
        <div className="space-y-4 text-sm" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <AiBadge />
            <span className="text-xs text-muted-foreground">{format.relativeTime(new Date(data.createdAt))}</span>
          </div>
          <p className="text-base leading-relaxed">{data.result.summary}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Section title={t("themes")}>
              {data.result.themes.map((x, i) => (
                <li key={i}>
                  <span className="font-medium">{x.name}</span> — <span className="text-muted-foreground">{x.evidence}</span>
                </li>
              ))}
            </Section>
            <Section title={t("hooks")}>
              {data.result.hooks.map((x, i) => (
                <li key={i}>
                  <span className="font-medium">{x.pattern}</span> — <span className="text-muted-foreground">“{x.example}”</span>
                </li>
              ))}
            </Section>
            <Section title={t("formats")}>
              {data.result.formats.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </Section>
            <div className="space-y-1">
              <p className="label-mono">{t("frequency")}</p>
              <p>{data.result.frequency}</p>
            </div>
          </div>
          <Section title={t("ideas")}>
            {data.result.ideasForBrand.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </Section>
          {data.result.caveats.length > 0 && (
            <Section title={t("caveats")}>
              {data.result.caveats.map((x, i) => (
                <li key={i} className="text-muted-foreground">
                  {x}
                </li>
              ))}
            </Section>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{enabled ? t("empty") : t("disabled")}</p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="label-mono">{title}</p>
      <ul className="list-disc space-y-1 pl-5">{children}</ul>
    </div>
  );
}
