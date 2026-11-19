import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

/** Pestañas de la sección Equipo (navegación con enlaces reales: accesible y compatible con el botón atrás). */
export async function TeamNav({ active, isAdmin, pendingCount }: { active: "members" | "approvals" | "activity"; isAdmin: boolean; pendingCount?: number }) {
  const t = await getTranslations("team.nav");
  const items = [
    { key: "members", href: "/app/team", label: t("members") },
    { key: "approvals", href: "/app/team/approvals", label: t("approvals"), count: pendingCount },
    ...(isAdmin ? [{ key: "activity", href: "/app/team/activity", label: t("activity") }] : []),
  ] as const;
  return (
    <nav aria-label={t("label")} className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-border px-1">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "border-selected font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                {"count" in item && item.count ? (
                  <span className="rounded-sm bg-warning/15 px-1.5 font-mono text-[11px] tabular-nums text-warning">{item.count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export async function TeamHeader({ workspaceName }: { workspaceName: string }) {
  const t = await getTranslations("team");
  return (
    <div>
      <p className="label-mono">{workspaceName}</p>
      <h1 className="text-[28px] leading-tight font-medium">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
    </div>
  );
}
