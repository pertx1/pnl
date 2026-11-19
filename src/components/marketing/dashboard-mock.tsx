import { CalendarDays, Check, Clock, Eye, Sparkles, TrendingUp, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

type Status = "draft" | "pending_approval" | "scheduled" | "published";

// Mismos colores que StatusBadge (src/components/kreo/status-badge.tsx), con texto traducido.
const STATUS_COLOR: Record<Status, string> = {
  draft: "var(--muted-foreground)",
  pending_approval: "var(--warning)",
  scheduled: "var(--primary-ink)",
  published: "var(--success)",
};

function MockStatus({ status, label }: { status: Status; label: string }) {
  const color = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm px-1.5 py-px text-[11px] font-semibold"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function MockAiBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-px text-[11px] font-medium text-muted-foreground">
      <Sparkles className="size-3 text-brand-amber-ink" aria-hidden />
      {label}
    </span>
  );
}

function MockStat({
  label,
  value,
  delta,
  trend,
  icon: Icon,
}: {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down";
  icon: typeof Eye;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card p-3">
      <div className="label-mono flex items-center justify-between gap-2 text-[10px]">
        <span className="truncate">{label}</span>
        <Icon className="size-3.5 shrink-0" aria-hidden />
      </div>
      <div className="mt-1 font-mono text-xl font-semibold tabular-nums sm:text-2xl">{value}</div>
      <div className={cn("truncate text-[11px] font-medium", trend === "up" ? "text-success" : "text-destructive")}>
        {delta}
      </div>
    </div>
  );
}

/**
 * Mock del panel para el hero, hecho con componentes (sin imágenes). Datos ficticios y así se indica.
 * El contenido es decorativo para lectores de pantalla: se describe con aria-label + figcaption.
 */
export async function DashboardMock() {
  const t = await getTranslations("landing.mock");
  const days = ["mon", "tue", "wed", "thu", "fri"] as const;
  const posts: { day: number; time: string; title: string; status: Status; ai?: boolean }[] = [
    { day: 0, time: "19:00", title: t("post1"), status: "published" },
    { day: 1, time: "13:30", title: t("post2"), status: "scheduled", ai: true },
    { day: 3, time: "19:00", title: t("post3"), status: "pending_approval", ai: true },
    { day: 4, time: "18:00", title: t("post4"), status: "draft" },
  ];
  const pending = posts.find((p) => p.status === "pending_approval")!;

  return (
    <figure aria-label={t("label")} className="w-full min-w-0">
      <div
        aria-hidden="true"
        className="rounded-lg border border-border bg-background/80 shadow-2xl shadow-black/20 backdrop-blur"
      >
        {/* Barra de ventana */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="size-2 rounded-full bg-muted-foreground/40" />
          <span className="size-2 rounded-full bg-muted-foreground/40" />
          <span className="size-2 rounded-full bg-muted-foreground/40" />
          <span className="ml-2 truncate font-mono text-[11px] text-muted-foreground">{t("project")}</span>
        </div>

        <div className="space-y-3 p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            <MockStat label={t("views")} value={t("viewsValue")} delta={t("viewsDelta")} trend="up" icon={Eye} />
            <MockStat label={t("followers")} value={t("followersValue")} delta={t("followersDelta")} trend="up" icon={Users} />
            <div className="col-span-2 sm:col-span-1">
              <MockStat label={t("engagement")} value={t("engagementValue")} delta={t("engagementDelta")} trend="down" icon={TrendingUp} />
            </div>
          </div>

          <div className="rounded-md border border-border bg-card p-3">
            <div className="label-mono mb-2 flex items-center gap-1.5 text-[10px]">
              <CalendarDays className="size-3.5" aria-hidden />
              {t("calendar")}
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {days.map((d, i) => {
                const post = posts.find((p) => p.day === i);
                return (
                  <div key={d} className="min-w-0 space-y-1">
                    <div className="font-mono text-[10px] text-muted-foreground uppercase">{t(`days.${d}`)}</div>
                    <div
                      className={cn(
                        "h-14 rounded-sm border border-dashed border-border p-1",
                        post && "border-solid bg-secondary",
                      )}
                    >
                      {post && (
                        <>
                          <div className="font-mono text-[10px] tabular-nums text-muted-foreground">{post.time}</div>
                          <div
                            className="mt-1 h-1.5 rounded-full"
                            style={{ background: STATUS_COLOR[post.status] }}
                          />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <ul className="mt-3 space-y-1.5">
              {posts.map((p) => (
                <li key={p.title} className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                      {t(`days.${days[p.day]}`)} {p.time}
                    </span>
                    <span className="min-w-0 truncate font-medium">{p.title}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {p.ai && <MockAiBadge label={t("ai")} />}
                    <MockStatus status={p.status} label={t(`status.${p.status}`)} />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                <Clock className="size-3.5 text-warning" />
                <span className="truncate">{pending.title}</span>
                <MockAiBadge label={t("ai")} />
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">{t("bestHour")}</div>
            </div>
            <span className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground">
              <Check className="size-3.5" />
              {t("approve")}
            </span>
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-center font-mono text-[11px] text-muted-foreground">{t("caption")}</figcaption>
    </figure>
  );
}
