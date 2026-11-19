import { getTranslations } from "next-intl/server";
import { Container, SectionHeading } from "./section-heading";
import { WaitlistForm } from "./waitlist-form";

export async function WaitlistSection({ refCode }: { refCode?: string }) {
  const t = await getTranslations("landing.waitlist");
  return (
    <section id="waitlist" aria-labelledby="waitlist-title" className="scroll-mt-20 border-t border-border py-20">
      <Container>
        <div className="grid gap-8 rounded-lg border border-border bg-card p-6 sm:p-10 lg:grid-cols-2 lg:items-center">
          <SectionHeading id="waitlist-title" label={t("label")} title={t("title")} subtitle={t("subtitle")} />
          <WaitlistForm refCode={refCode} />
        </div>
      </Container>
    </section>
  );
}
