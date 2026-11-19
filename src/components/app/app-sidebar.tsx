"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  BarChart3,
  FileBarChart,
  Flame,
  HandCoins,
  Inbox,
  Lightbulb,
  Map,
  PackageSearch,
  Scissors,
  ShoppingBag,
  Swords,
  Users,
  CalendarDays,
  Coins,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  Plug,
  Plus,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { KreoLogo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { switchWorkspace } from "@/app/app/actions";
import type { WorkspaceSummary } from "@/lib/server/dal";
import { cn } from "@/lib/utils";

/** Navegación del proyecto agrupada por intención. Cada ruta la implementa su módulo. */
const PROJECT_NAV: { label: string; items: { path: string; icon: typeof LayoutDashboard; label: string; also?: string[] }[] }[] = [
  {
    label: "groupCreate",
    items: [
      { path: "studio", icon: Sparkles, label: "studio" },
      { path: "clipper", icon: Scissors, label: "clipper" },
      { path: "inspiration", icon: Lightbulb, label: "inspiration" },
      { path: "brand-kit", icon: Palette, label: "brandKit" },
    ],
  },
  {
    label: "groupPublish",
    items: [
      { path: "calendar", icon: CalendarDays, label: "calendar", also: ["posts"] },
      { path: "inbox", icon: Inbox, label: "inbox" },
      { path: "accounts", icon: Plug, label: "accounts" },
    ],
  },
  {
    label: "groupGrow",
    items: [
      { path: "analytics", icon: BarChart3, label: "analytics" },
      { path: "competitors", icon: Swords, label: "competitors" },
      { path: "products", icon: PackageSearch, label: "products" },
      { path: "strategy", icon: Map, label: "strategy" },
      { path: "warmup", icon: Flame, label: "warmup" },
    ],
  },
  {
    label: "groupBusiness",
    items: [
      { path: "shopify", icon: ShoppingBag, label: "shopify" },
      { path: "reports", icon: FileBarChart, label: "reports" },
    ],
  },
];

type Props = {
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  projects: { id: string; name: string }[];
  credits: number;
  monthlyCredits: number;
  email: string;
};

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  soon,
  soonLabel,
}: {
  href?: string;
  icon: typeof LayoutDashboard;
  label: string;
  active?: boolean;
  soon?: boolean;
  soonLabel?: string;
}) {
  const cls = cn(
    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
    active ? "bg-sidebar-accent font-medium text-foreground" : "text-muted-foreground",
    !soon && !active && "hover:bg-sidebar-accent/60 hover:text-foreground",
    soon && "cursor-not-allowed opacity-60",
  );
  const content = (
    <>
      <Icon className={cn("size-4", active && "text-primary-ink")} strokeWidth={1.5} aria-hidden />
      <span className="flex-1 truncate">{label}</span>
      {soon && <span className="label-mono !text-[9px]">{soonLabel}</span>}
    </>
  );
  if (soon || !href) return <div className={cls} aria-disabled>{content}</div>;
  return (
    <Link href={href} className={cls} aria-current={active ? "page" : undefined}>
      {content}
    </Link>
  );
}

export function AppSidebar({ workspace, workspaces, projects, credits, monthlyCredits, email }: Props) {
  const t = useTranslations("nav");
  const tp = useTranslations("projects");
  const tcr = useTranslations("credits");
  const ta = useTranslations("auth");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const match = pathname.match(/^\/app\/p\/([0-9a-f-]{36})/i);
  const currentProjectId = match?.[1];
  const currentProject = projects.find((p) => p.id === currentProjectId);
  const base = currentProject ? `/app/p/${currentProject.id}` : null;

  const sidebar = (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center justify-between">
        <Link href="/app" aria-label="Kreo">
          <KreoLogo className="h-6" />
        </Link>
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setOpen(false)} aria-label={t("closeMenu")}>
          <X />
        </Button>
      </div>

      {/* workspace */}
      <label className="block">
        <span className="label-mono">Workspace</span>
        <select
          className="mt-1 w-full truncate rounded-md border border-border bg-background px-2.5 py-2 text-sm"
          value={workspace.id}
          disabled={pending}
          onChange={(e) => {
            const id = e.target.value;
            start(() => switchWorkspace(id));
          }}
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>

      <nav className="space-y-0.5" aria-label={t("projects")}>
        <NavItem href="/app" icon={FolderKanban} label={t("projects")} active={pathname === "/app"} />
        <NavItem href="/app/calendar" icon={CalendarDays} label={t("globalCalendar")} active={pathname === "/app/calendar"} />
      </nav>

      {/* proyectos */}
      <div className="min-h-0 space-y-1 overflow-y-auto">
        <div className="flex items-center justify-between px-1">
          <span className="label-mono">{t("project")}</span>
          <Link href="/app/projects/new" className="text-muted-foreground hover:text-foreground" aria-label={tp("new")}>
            <Plus className="size-4" />
          </Link>
        </div>
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/app/p/${p.id}`}
            className={cn(
              "block truncate rounded-md px-2.5 py-1.5 text-sm",
              p.id === currentProjectId ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className={cn("mr-2 inline-block size-1.5 rounded-full align-middle", p.id === currentProjectId ? "bg-primary" : "bg-border")} />
            {p.name}
          </Link>
        ))}
      </div>

      {base && (
        <nav className="space-y-4 border-t border-sidebar-border pt-4" aria-label={currentProject?.name}>
          <NavItem href={base} icon={LayoutDashboard} label={t("dashboard")} active={pathname === base} />
          {PROJECT_NAV.map((group) => (
            <div key={group.label} className="space-y-0.5">
              <p className="label-mono px-2.5 pb-1 !text-[10px]">{t(group.label)}</p>
              {group.items.map((it) => {
                const href = `${base}/${it.path}`;
                return <NavItem key={it.path} href={href} icon={it.icon} label={t(it.label)} active={pathname.startsWith(href) || (it.also ?? []).some((a) => pathname.startsWith(`${base}/${a}`))} />;
              })}
            </div>
          ))}
        </nav>
      )}

      <div className="mt-auto space-y-3 border-t border-sidebar-border pt-4">
        <div className="space-y-0.5">
          <NavItem href="/app/team" icon={Users} label={t("team")} active={pathname.startsWith("/app/team")} />
          <NavItem href="/app/affiliates" icon={HandCoins} label={t("affiliates")} active={pathname.startsWith("/app/affiliates")} />
          <NavItem href="/app/settings" icon={Settings} label={t("settings")} active={pathname.startsWith("/app/settings")} />
        </div>
        <Link href="/app/billing" className="flex items-center justify-between rounded-md bg-sidebar-accent px-3 py-2 hover:ring-1 hover:ring-primary/40">
          <span className="flex items-center gap-2 text-sm">
            <Coins className="size-4 text-brand-amber-ink" aria-hidden />
            <span className="label-mono">{tcr("balance")}</span>
          </span>
          <span className="font-mono text-sm tabular-nums" title={tcr("of", { max: monthlyCredits })}>
            {credits}
          </span>
        </Link>
        <div className="truncate text-xs text-muted-foreground" title={email}>
          {email}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LocaleSwitcher />
          <form action="/auth/signout" method="post" className="ml-auto">
            <Button type="submit" variant="ghost" size="sm">
              <LogOut /> {ta("logout")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur md:hidden">
        <KreoLogo className="h-5" />
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={t("openMenu")}>
          <Menu />
        </Button>
      </div>
      {open && <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 shrink-0 border-r border-sidebar-border bg-sidebar transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {sidebar}
      </aside>
    </>
  );
}
