import Link from "next/link";
import { Check, Coins } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Container, SectionHeading } from "./section-heading";

const PLANS = ["free", "pro", "agency"] as const;

export async function Pricing() {
  const t = await getTranslations("landing.pricing");
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 border-t border-border py-20">
      <Container className="space-y-10">
        <SectionHeading id="pricing-title" label={t("label")} title={t("title")} subtitle={t("subtitle")} />
        <ul className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => {
            const featured = plan === "pro";
            return (
              <li
                key={plan}
                className={cn(
                  "flex flex-col gap-5 rounded-lg border bg-card p-6",
                  featured ? "border-primary-ink" : "border-border",
                )}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xl font-semibold">{t(`plans.${plan}.name`)}</h3>
                    {featured && (
                      <span className="rounded-sm bg-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-primary-foreground uppercase">
                        {t("popular")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{t(`plans.${plan}.desc`)}</p>
                </div>
                <p className="font-mono text-lg font-semibold">{t("tba")}</p>
                <ul className="flex-1 space-y-2">
                  {(["f1", "f2", "f3"] as const).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden />
                      {t(`plans.${plan}.${f}`)}
                    </li>
                  ))}
                </ul>
                <Button asChild variant={featured ? "default" : "outline"} className="w-full">
                  <Link href="#waitlist">{t("cta")}</Link>
                </Button>
              </li>
            );
          })}
        </ul>
        <p className="flex max-w-3xl items-start gap-2 text-sm text-muted-foreground">
          <Coins className="mt-0.5 size-4 shrink-0 text-brand-amber-ink" aria-hidden />
          {t("creditsNote")}
        </p>
      </Container>
    </section>
  );
}
