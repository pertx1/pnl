import { getTranslations } from "next-intl/server";
import { Container, SectionHeading } from "./section-heading";

const STEPS = ["connect", "create", "approve"] as const;

export async function HowItWorks() {
  const t = await getTranslations("landing.how");
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20 border-t border-border py-20">
      <Container className="space-y-10">
        <SectionHeading id="how-title" label={t("label")} title={t("title")} />
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((key, i) => (
            <li key={key} className="relative space-y-3 rounded-lg border border-border bg-card p-6">
              <span className="font-mono text-sm font-semibold text-primary-ink tabular-nums" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="text-xl font-semibold">{t(`steps.${key}.title`)}</h3>
              <p className="text-sm text-muted-foreground">{t(`steps.${key}.desc`)}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
