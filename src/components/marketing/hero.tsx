import { getTranslations } from "next-intl/server";
import { DashboardMock } from "./dashboard-mock";
import { Container } from "./section-heading";
import { WaitlistForm } from "./waitlist-form";

export async function Hero({ refCode }: { refCode?: string }) {
  const t = await getTranslations("landing.hero");
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      {/* Rejilla de fondo decorativa */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(var(--foreground)_1px,transparent_1px),linear-gradient(90deg,var(--foreground)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />
      <Container className="relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:py-24">
        <div className="min-w-0 space-y-6">
          <p className="label-mono inline-flex items-center gap-2">
            <span aria-hidden className="size-1.5 rounded-full bg-success motion-safe:animate-pulse" />
            {t("eyebrow")}
          </p>
          <h1 id="hero-title" className="text-4xl leading-[1.05] font-bold text-balance sm:text-6xl">
            {t.rich("title", {
              hl: (chunks) => <span className="bg-primary px-2 text-primary-foreground">{chunks}</span>,
            })}
          </h1>
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">{t("subtitle")}</p>
          <div className="max-w-lg space-y-2">
            <WaitlistForm compact refCode={refCode} />
            <p className="font-mono text-xs text-muted-foreground">{t("formNote")}</p>
          </div>
        </div>
        <DashboardMock />
      </Container>
    </section>
  );
}
