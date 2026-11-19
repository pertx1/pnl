import { BadgeCheck, Gauge, KeyRound, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Container, SectionHeading } from "./section-heading";

const ITEMS: { key: string; icon: LucideIcon }[] = [
  { key: "official", icon: KeyRound },
  { key: "approve", icon: BadgeCheck },
  { key: "limits", icon: Gauge },
  { key: "labels", icon: Sparkles },
  { key: "eu", icon: ShieldCheck },
];

export async function Trust() {
  const t = await getTranslations("landing.trust");
  return (
    <section aria-labelledby="trust-title" className="border-t border-border bg-card/40 py-20">
      <Container className="space-y-10">
        <SectionHeading id="trust-title" label={t("label")} title={t("title")} subtitle={t("subtitle")} />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map(({ key, icon: Icon }) => (
            <li key={key} className="space-y-2 rounded-lg border border-border bg-background p-5">
              <Icon className="size-5 text-primary-ink" strokeWidth={1.5} aria-hidden />
              <h3 className="font-semibold">{t(`items.${key}.title`)}</h3>
              <p className="text-sm text-muted-foreground">{t(`items.${key}.desc`)}</p>
            </li>
          ))}
        </ul>
        <p className="max-w-3xl border-l-2 border-warning pl-4 text-sm text-muted-foreground">{t("disclaimer")}</p>
      </Container>
    </section>
  );
}
