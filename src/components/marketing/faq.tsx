import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Container, SectionHeading } from "./section-heading";

const QUESTIONS = ["safe", "permission", "data", "dms", "credits", "results", "platforms", "rights"] as const;

/** Acordeón nativo con <details>/<summary>: accesible por teclado sin JavaScript. */
export async function Faq() {
  const t = await getTranslations("landing.faq");
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 border-t border-border py-20">
      <Container className="grid gap-10 lg:grid-cols-[1fr_2fr]">
        <SectionHeading id="faq-title" label={t("label")} title={t("title")} />
        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {QUESTIONS.map((key) => (
            <details key={key} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-5 py-4 font-medium outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
                <h3 className="text-base">{t(`items.${key}.q`)}</h3>
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <p className="px-5 pb-5 text-sm text-muted-foreground">{t(`items.${key}.a`)}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
