"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CreditCost } from "@/components/kreo/credit-cost";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generateImage } from "./actions";

type Model = { id: string; label: string; credits: number; licenseName: string; licenseUrl: string };
const ASPECTS = ["square", "portrait", "landscape", "story"] as const;

export function StudioForm({ projectId, balance, enabled, models }: { projectId: string; balance: number; enabled: boolean; models: Model[] }) {
  const t = useTranslations("studio");
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]>("square");
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [brand, setBrand] = useState(true);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const model = models.find((m) => m.id === modelId);
  const insufficient = model ? balance < model.credits : true;

  return (
    <Card>
      <CardContent className="space-y-4">
        <fieldset disabled={!enabled || pending} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prompt">{t("prompt")}</Label>
            <Textarea id="prompt" rows={3} maxLength={1500} value={prompt} placeholder={t("promptPlaceholder")} onChange={(e) => setPrompt(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="aspect">{t("aspect")}</Label>
              <select id="aspect" className="w-full rounded-md border border-input bg-transparent px-2 py-2 text-sm" value={aspect} onChange={(e) => setAspect(e.target.value as (typeof ASPECTS)[number])}>
                {ASPECTS.map((a) => (
                  <option key={a} value={a}>
                    {t(`aspects.${a}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">{t("model")}</Label>
              <select id="model" className="w-full rounded-md border border-input bg-transparent px-2 py-2 text-sm" value={modelId} onChange={(e) => setModelId(e.target.value)}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={brand} onCheckedChange={(v) => setBrand(Boolean(v))} /> {t("brandColors")}
          </label>
        </fieldset>

        {model && (
          <p className="text-xs text-muted-foreground">
            {t("license", { name: model.licenseName })} ·{" "}
            <a href={model.licenseUrl} target="_blank" rel="noreferrer" className="underline">
              {t("licenseLink")}
            </a>
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t("termsNote")}</p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.generic")}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex items-center gap-3">
            <span className="label-mono">{t("cost")}</span>
            {model && <CreditCost credits={model.credits} />}
            <span className="font-mono text-xs text-muted-foreground">{t("balance", { balance })}</span>
          </div>
          <Button
            variant="brand"
            disabled={!enabled || pending || prompt.trim().length < 3 || insufficient}
            onClick={() =>
              start(async () => {
                setError(undefined);
                const res = await generateImage({ projectId, modelId, prompt, aspect, useBrandColors: brand, idempotencyKey: crypto.randomUUID() });
                if (!res.ok) return setError(res.error);
                toast.success(t("generated"));
                setPrompt("");
                router.refresh();
              })
            }
          >
            <Sparkles /> {pending ? t("generating") : `${t("generate")} · ${model?.credits ?? 0}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
