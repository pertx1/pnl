"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateBrandKit } from "@/app/app/actions";
import type { ErrorKey } from "@/lib/server/errors";

export type BrandKitValues = {
  tone_of_voice: string;
  target_audience: string;
  banned_words: string;
  colors: { name: string; hex: string }[];
  fonts: { role: string; family: string }[];
  example_posts: { url: string; note: string }[];
};

export function BrandKitForm({ projectId, initial, readOnly }: { projectId: string; initial: BrandKitValues; readOnly: boolean }) {
  const t = useTranslations("brandKit");
  const tc = useTranslations("common");
  const [v, setV] = useState(initial);
  const [error, setError] = useState<ErrorKey>();
  const [pending, start] = useTransition();

  function set<K extends keyof BrandKitValues>(key: K, value: BrandKitValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
  }
  function update<K extends "colors" | "fonts" | "example_posts">(key: K, i: number, patch: Partial<BrandKitValues[K][number]>) {
    set(key, v[key].map((item, idx) => (idx === i ? { ...item, ...patch } : item)) as BrandKitValues[K]);
  }
  function remove<K extends "colors" | "fonts" | "example_posts">(key: K, i: number) {
    set(key, v[key].filter((_, idx) => idx !== i) as BrandKitValues[K]);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    start(async () => {
      const res = await updateBrandKit({
        projectId,
        tone_of_voice: v.tone_of_voice,
        target_audience: v.target_audience,
        banned_words: v.banned_words.split(",").map((w) => w.trim()).filter(Boolean),
        colors: v.colors.filter((c) => c.hex),
        fonts: v.fonts.filter((f) => f.family.trim()),
        example_posts: v.example_posts.filter((p) => p.url.trim()),
      });
      if (res?.error) setError(res.error);
      else toast.success(tc("saved"));
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset disabled={readOnly || pending} className="space-y-4">
        <Card>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tone">{t("tone")}</Label>
              <Textarea id="tone" value={v.tone_of_voice} maxLength={2000} placeholder={t("tonePlaceholder")} onChange={(e) => set("tone_of_voice", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audience">{t("audience")}</Label>
              <Textarea id="audience" value={v.target_audience} maxLength={2000} placeholder={t("audiencePlaceholder")} onChange={(e) => set("target_audience", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="banned">{t("bannedWords")}</Label>
              <Input id="banned" value={v.banned_words} placeholder={t("bannedWordsPlaceholder")} onChange={(e) => set("banned_words", e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("bannedWordsHint")}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("colors")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {v.colors.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={`${t("colors")} ${i + 1}`}
                  value={c.hex || "#000000"}
                  onChange={(e) => update("colors", i, { hex: e.target.value.toUpperCase() })}
                  className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent"
                />
                <Input className="w-28 font-mono uppercase" value={c.hex} maxLength={7} aria-label="HEX" onChange={(e) => update("colors", i, { hex: e.target.value })} />
                <Input value={c.name} maxLength={40} placeholder={t("colorName")} aria-label={t("colorName")} onChange={(e) => update("colors", i, { name: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" aria-label={tc("remove")} onClick={() => remove("colors", i)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            {v.colors.length < 12 && (
              <Button type="button" variant="outline" size="sm" onClick={() => set("colors", [...v.colors, { name: "", hex: "#C6F432" }])}>
                <Plus /> {tc("add")}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("fonts")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {v.fonts.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input className="w-40" value={f.role} maxLength={40} placeholder={t("fontRole")} aria-label={t("fontRole")} onChange={(e) => update("fonts", i, { role: e.target.value })} />
                <Input value={f.family} maxLength={60} placeholder={t("fontFamily")} aria-label={t("fontFamily")} onChange={(e) => update("fonts", i, { family: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" aria-label={tc("remove")} onClick={() => remove("fonts", i)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            {v.fonts.length < 6 && (
              <Button type="button" variant="outline" size="sm" onClick={() => set("fonts", [...v.fonts, { role: "", family: "" }])}>
                <Plus /> {tc("add")}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("examples")}</CardTitle>
            <CardDescription>{t("examplesHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {v.example_posts.map((p, i) => (
              <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input type="url" value={p.url} maxLength={500} placeholder="https://" aria-label={t("exampleUrl")} onChange={(e) => update("example_posts", i, { url: e.target.value })} />
                <Input value={p.note} maxLength={300} placeholder={t("exampleNote")} aria-label={t("exampleNote")} onChange={(e) => update("example_posts", i, { note: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" aria-label={tc("remove")} onClick={() => remove("example_posts", i)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            {v.example_posts.length < 20 && (
              <Button type="button" variant="outline" size="sm" onClick={() => set("example_posts", [...v.example_posts, { url: "", note: "" }])}>
                <Plus /> {tc("add")}
              </Button>
            )}
          </CardContent>
        </Card>

      </fieldset>

      <FormError error={error} />
      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? tc("saving") : tc("save")}
          </Button>
        </div>
      )}
    </form>
  );
}
