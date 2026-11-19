"use client";

import { useState, useTransition } from "react";
import { TerminalCursor } from "@/components/brand/terminal-cursor";
import { useFormatter, useTranslations } from "next-intl";
import {BookmarkPlus, ExternalLink, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EuCountry } from "@/lib/research/parse";
import { cn } from "@/lib/utils";
import { useResearchError } from "../competitors/_components/shared";
import { saveProduct, searchAds, type ScoredAd } from "./actions";
import { ScoreBadge, ScoreFactors } from "./score-view";

const selectCls = "w-full rounded-md border border-input bg-transparent px-2 py-2 text-sm";
const LANGS = ["es", "en", "fr", "de", "it", "pt", "nl", "pl"] as const;
const PLATFORMS = ["FACEBOOK", "INSTAGRAM", "MESSENGER", "AUDIENCE_NETWORK", "THREADS"] as const;

export function SearchPanel({
  projectId,
  enabled,
  canEdit,
  countries,
  lists,
  defaultCountry,
}: {
  projectId: string;
  enabled: boolean;
  canEdit: boolean;
  countries: readonly EuCountry[];
  lists: { id: string; name: string }[];
  defaultCountry: EuCountry;
}) {
  const t = useTranslations("products.search");
  const format = useFormatter();
  const errorText = useResearchError();
  const [terms, setTerms] = useState("");
  const [country, setCountry] = useState<EuCountry>(defaultCountry);
  const [language, setLanguage] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "ALL" | "INACTIVE">("ACTIVE");
  const [platform, setPlatform] = useState<"" | (typeof PLATFORMS)[number]>("");
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");
  const [exact, setExact] = useState(false);
  const [results, setResults] = useState<ScoredAd[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [saveList, setSaveList] = useState<string>(lists[0]?.id ?? "");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [busy, start] = useTransition();

  function run(after?: string) {
    start(async () => {
      const r = await searchAds({
        projectId,
        terms,
        country,
        language,
        status,
        platform,
        dateMin,
        dateMax,
        exactPhrase: exact,
        after,
      });
      if (!r.ok) {
        toast.error(errorText(r.error));
        return;
      }
      setResults((prev) => (after && prev ? [...prev, ...r.ads] : r.ads));
      setCursor(r.nextCursor);
    });
  }

  function save(ad: ScoredAd) {
    start(async () => {
      const title = (ad.linkTitles[0] || ad.bodies[0] || ad.pageName).slice(0, 120);
      const r = await saveProduct({
        projectId,
        listId: saveList || null,
        title,
        ad: {
          id: ad.id,
          pageName: ad.pageName,
          bodies: ad.bodies,
          linkTitles: ad.linkTitles,
          libraryUrl: ad.libraryUrl,
          startedAt: ad.startedAt,
          stoppedAt: ad.stoppedAt,
          platforms: ad.platforms,
          countries: ad.countries,
          euReach: ad.euReach,
          variants: ad.variants,
        },
      });
      if (r.ok) {
        setSaved((s) => new Set(s).add(ad.id));
        toast.success(t("saved"));
      } else toast.error(errorText(r.error));
    });
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (terms.trim().length >= 2) run();
        }}
      >
        <fieldset disabled={!enabled || busy} className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1 space-y-1">
              <Label htmlFor="ad-terms">{t("keyword")}</Label>
              <Input id="ad-terms" value={terms} maxLength={100} onChange={(e) => setTerms(e.target.value)} placeholder={t("keywordPlaceholder")} />
            </div>
            <Button type="submit" className="self-end" disabled={!enabled || busy || terms.trim().length < 2}>
              {busy ? <TerminalCursor /> : <Search />} {t("submit")}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="ad-country">{t("country")}</Label>
              <select id="ad-country" className={selectCls} value={country} onChange={(e) => setCountry(e.target.value as EuCountry)}>
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ad-lang">{t("language")}</Label>
              <select id="ad-lang" className={selectCls} value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="">{t("any")}</option>
                {LANGS.map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ad-status">{t("status")}</Label>
              <select id="ad-status" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="ACTIVE">{t("statusActive")}</option>
                <option value="ALL">{t("statusAll")}</option>
                <option value="INACTIVE">{t("statusInactive")}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ad-platform">{t("platform")}</Label>
              <select id="ad-platform" className={selectCls} value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)}>
                <option value="">{t("any")}</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {t(`platforms.${p}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ad-from">{t("from")}</Label>
              <Input id="ad-from" type="date" value={dateMin} onChange={(e) => setDateMin(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ad-to">{t("to")}</Label>
              <Input id="ad-to" type="date" value={dateMax} onChange={(e) => setDateMax(e.target.value)} />
            </div>
            <label className="col-span-2 flex items-center gap-2 self-end pb-2 text-sm">
              <Checkbox checked={exact} onCheckedChange={(v) => setExact(v === true)} /> {t("exact")}
            </label>
          </div>
        </fieldset>
        <p className="text-xs text-muted-foreground">{t("free")}</p>
      </form>

      {results && (
        <div className="space-y-3" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="label-mono">{t("results", { count: results.length })}</p>
            {canEdit && lists.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                {t("saveTo")}
                <select className="rounded-md border border-input bg-transparent px-2 py-1 text-xs" value={saveList} onChange={(e) => setSaveList(e.target.value)}>
                  <option value="">{t("noList")}</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {results.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{t("noResults")}</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {results.map((ad) => (
                <li key={ad.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{ad.pageName}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {ad.startedAt ? t("since", { date: format.dateTime(new Date(ad.startedAt), { dateStyle: "medium" }) }) : "—"}
                        {ad.stoppedAt ? ` · ${t("until", { date: format.dateTime(new Date(ad.stoppedAt), { dateStyle: "medium" }) })}` : ""}
                      </p>
                    </div>
                    <ScoreBadge score={ad.score} />
                  </div>
                  {(ad.linkTitles[0] || ad.bodies[0]) && (
                    <p className={cn("line-clamp-4 text-sm whitespace-pre-line", !ad.linkTitles[0] && "text-muted-foreground")}>
                      {ad.linkTitles[0] ? <strong className="block">{ad.linkTitles[0]}</strong> : null}
                      {ad.bodies[0]}
                    </p>
                  )}
                  <ScoreFactors factors={ad.factors} />
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a href={ad.libraryUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink /> {t("viewInLibrary")}
                      </a>
                    </Button>
                    {canEdit && (
                      <Button size="sm" variant="secondary" disabled={busy || saved.has(ad.id)} onClick={() => save(ad)}>
                        <BookmarkPlus /> {saved.has(ad.id) ? t("savedShort") : t("save")}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {cursor && (
            <div className="text-center">
              <Button variant="outline" disabled={busy} onClick={() => run(cursor)}>
                {busy && <TerminalCursor />} {t("more")}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t("attribution")}</p>
        </div>
      )}
    </div>
  );
}
