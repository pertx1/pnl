import {
  BarChart3,
  Binoculars,
  BookMarked,
  Bot,
  CalendarClock,
  FileText,
  FolderKanban,
  Inbox,
  type LucideIcon,
  Map as MapIcon,
  Scissors,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { Container, SectionHeading } from "./section-heading";

// `mvp: true` = disponible en el lanzamiento. El resto lleva el badge "Próximamente".
const FEATURES: { key: string; icon: LucideIcon; mvp: boolean; ai?: boolean }[] = [
  { key: "projects", icon: FolderKanban, mvp: true },
  { key: "ai", icon: Sparkles, mvp: true, ai: true },
  { key: "calendar", icon: CalendarClock, mvp: true },
  { key: "analytics", icon: BarChart3, mvp: true },
  { key: "clipper", icon: Scissors, mvp: false },
  { key: "competitors", icon: Binoculars, mvp: false },
  { key: "winners", icon: TrendingUp, mvp: false },
  { key: "hooks", icon: BookMarked, mvp: false },
  { key: "inbox", icon: Inbox, mvp: false },
  { key: "strategy", icon: MapIcon, mvp: false },
  { key: "shopify", icon: ShoppingBag, mvp: false },
  { key: "reports", icon: FileText, mvp: false },
  { key: "team", icon: Users, mvp: false },
  { key: "mcp", icon: Bot, mvp: false },
];

export async function Features() {
  const t = await getTranslations("landing.features");
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-20 border-t border-border py-20">
      <Container className="space-y-10">
        <SectionHeading id="features-title" label={t("label")} title={t("title")} subtitle={t("subtitle")} />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {FEATURES.map(({ key, icon: Icon, mvp, ai }) => (
            <li key={key} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-md border border-border",
                    ai ? "text-brand-amber-ink" : mvp ? "text-primary-ink" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.5} aria-hidden />
                </span>
                {mvp ? (
                  <span className="rounded-sm bg-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-primary-foreground uppercase">
                    {t("available")}
                  </span>
                ) : (
                  <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    {t("soon")}
                  </span>
                )}
              </div>
              <h3 className="text-base font-semibold">{t(`items.${key}.title`)}</h3>
              <p className="text-sm text-muted-foreground">{t(`items.${key}.desc`)}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
