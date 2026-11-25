"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  ChevronDown,
  Coins,
  FolderKanban,
  HandCoins,
  House,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Scissors,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { KreoLogo, KreoMark } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import type { WorkspaceSummary } from "@/lib/server/dal";
import { sameSectionHref } from "@/lib/projects/identity";
import { cn } from "@/lib/utils";
import { CommandPalette, useShortcutLabel } from "./command-palette";
import { CreateMenu } from "./create-menu";
import { MORE_PROJECT_NAV, type NavIcon } from "./nav-config";
import { rememberProject, useCurrentProject, type ShellProject } from "./project-context";
import { ProjectSwitcher, ProjectSwitcherTrigger } from "./project-switcher";

type Props = {
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  projects: ShellProject[];
  recentProjectIds: string[];
  credits: number;
  monthlyCredits: number;
  email: string;
  unreadNotifications?: number;
};

/** ¿El foco está en un campo de texto? (los atajos de una tecla no deben dispararse al escribir). */
function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** Contador junto a una sección. El número se lee con su significado (no solo el color). */
function CountBadge({ count, label, tone = "neutral" }: { count: number; label: string; tone?: "neutral" | "warning" }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-semibold tabular-nums",
        tone === "warning" ? "bg-warning/15 text-warning" : "bg-foreground text-background",
      )}
    >
      <span aria-hidden>{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  badge,
  size = "md",
}: {
  href: string;
  icon: NavIcon;
  label: string;
  active?: boolean;
  badge?: React.ReactNode;
  size?: "md" | "sm";
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-2 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
        size === "md" ? "min-h-11 py-1.5 font-medium" : "min-h-9 py-1 pointer-coarse:min-h-11",
        active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center transition-colors",
          size === "md" ? "size-8 rounded-[10px]" : "size-6 rounded-lg",
          active ? "bg-primary text-primary-foreground" : size === "md" ? "bg-muted text-foreground group-hover:bg-background" : "text-muted-foreground",
        )}
      >
        <Icon className={size === "md" ? "size-[18px]" : "size-4"} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge}
    </Link>
  );
}

export function AppSidebar({ workspace, workspaces, projects, recentProjectIds, credits, monthlyCredits, email, unreadNotifications = 0 }: Props) {
  const t = useTranslations("nav");
  const ts = useTranslations("shell.nav");
  const tm = useTranslations("shell.mobile");
  const tcr = useTranslations("credits");
  const ta = useTranslations("auth");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState<boolean | null>(null);
  const shortcut = useShortcutLabel();
  const { pathname, current, inProject, recent } = useCurrentProject(projects, recentProjectIds);

  // Recuerda el último proyecto abierto (para el Inicio y el orden de «Recientes»).
  const urlProjectId = inProject ? current?.id : undefined;
  useEffect(() => {
    if (urlProjectId) rememberProject(urlProjectId);
  }, [urlProjectId]);

  // Atajos: Alt + 1…9 cambia al proyecto N (misma sección); «G» y luego «P» abre el selector.
  const lastG = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target)) return;
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const target = projects[Number(digit[1]) - 1];
        if (target) {
          e.preventDefault();
          router.push(sameSectionHref(window.location.pathname, window.location.search, target.id));
        }
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === "g") {
        lastG.current = e.timeStamp;
      } else if (key === "p" && e.timeStamp - lastG.current < 1200) {
        e.preventDefault();
        lastG.current = 0;
        setOpen(false);
        setSwitcherOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [projects, router]);

  const base = current ? `/app/p/${current.id}` : null;
  const at = (path: string) => (base ? pathname.startsWith(`${base}/${path}`) : false);
  const daily = base
    ? [
        { key: "panel", href: base, icon: LayoutDashboard, label: ts("panel"), active: pathname === base },
        {
          key: "calendar",
          href: `${base}/calendar`,
          icon: CalendarDays,
          label: ts("calendar"),
          active: at("calendar") || at("posts"),
          badge: <CountBadge count={current?.pending ?? 0} label={ts("pendingBadge", { count: current?.pending ?? 0 })} tone="warning" />,
        },
        {
          key: "inbox",
          href: `${base}/inbox`,
          icon: Inbox,
          label: ts("inbox"),
          active: at("inbox"),
          badge: <CountBadge count={current?.unread ?? 0} label={ts("unreadBadge", { count: current?.unread ?? 0 })} />,
        },
        { key: "studio", href: `${base}/studio`, icon: Sparkles, label: ts("studio"), active: at("studio") },
        { key: "clipper", href: `${base}/clipper`, icon: Scissors, label: ts("clipper"), active: at("clipper") },
      ]
    : [];
  const more = base ? MORE_PROJECT_NAV.map((it) => ({ ...it, href: `${base}/${it.path}`, active: at(it.path) })) : [];
  const account = [
    { href: "/app/projects", icon: FolderKanban, label: t("projects"), active: pathname === "/app/projects" || pathname === "/app/projects/new" },
    { href: "/app/calendar", icon: CalendarDays, label: t("globalCalendar"), active: pathname === "/app/calendar" },
    { href: "/app/team", icon: Users, label: t("team"), active: pathname.startsWith("/app/team") },
    { href: "/app/affiliates", icon: HandCoins, label: t("affiliates"), active: pathname.startsWith("/app/affiliates") },
  ];
  const moreHasActive = more.some((x) => x.active) || account.some((x) => x.active);
  const showMore = moreOpen ?? moreHasActive;

  // Barra inferior (móvil): Inicio · Calendario · [Crear] · Bandeja · Más.
  const tabs = [
    { key: "home", href: "/app", icon: House, label: ts("home"), active: pathname === "/app", badge: 0, badgeLabel: "" },
    {
      key: "calendar",
      href: base ? `${base}/calendar` : "/app/calendar",
      icon: CalendarDays,
      label: ts("calendar"),
      active: base ? at("calendar") || at("posts") : pathname === "/app/calendar",
      badge: current?.pending ?? 0,
      badgeLabel: ts("pendingBadge", { count: current?.pending ?? 0 }),
    },
  ];
  const tabsRight = [
    {
      key: "inbox",
      href: base ? `${base}/inbox` : "/app/projects",
      icon: Inbox,
      label: ts("inbox"),
      active: at("inbox"),
      badge: current?.unread ?? 0,
      badgeLabel: ts("unreadBadge", { count: current?.unread ?? 0 }),
    },
  ];
  const moreTabActive = ![...tabs, ...tabsRight].some((x) => x.active);

  const tab = (x: (typeof tabs)[number]) => (
    <li key={x.key}>
      <Link
        href={x.href}
        aria-current={x.active ? "page" : undefined}
        className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none focus-visible:bg-accent", x.active ? "text-foreground" : "text-muted-foreground")}
      >
        <span className={cn("relative grid h-7 w-12 place-items-center rounded-full transition-colors", x.active && "bg-primary text-primary-foreground")}>
          <x.icon className="size-5" strokeWidth={1.75} aria-hidden />
          {x.badge > 0 && (
            <span className="absolute -top-1 right-0 grid h-4 min-w-4 place-items-center rounded-full bg-warning px-1 font-mono text-[10px] font-bold text-background tabular-nums">
              <span aria-hidden>{x.badge > 99 ? "99+" : x.badge}</span>
            </span>
          )}
        </span>
        {x.label}
        {x.badge > 0 && <span className="sr-only">· {x.badgeLabel}</span>}
      </Link>
    </li>
  );

  const sidebar = (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between">
        <Link href="/app" aria-label="Kreo" className="rounded-md">
          <KreoLogo className="h-6" />
        </Link>
        <div className="hidden md:block">
          <NotificationBell initialUnread={unreadNotifications} />
        </div>
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(false)} aria-label={t("closeMenu")}>
          <X />
        </Button>
      </div>

      <ProjectSwitcherTrigger
        current={current}
        onOpen={() => {
          setOpen(false);
          setSwitcherOpen(true);
        }}
      />

      <div className="hidden space-y-1.5 md:block">
        <CreateMenu currentProject={current} />
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-haspopup="dialog"
          aria-keyshortcuts="Control+K Meta+K"
          className="flex min-h-10 w-full items-center gap-2.5 rounded-full border px-3.5 text-sm text-muted-foreground outline-none hover:border-border-strong hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Search className="size-4" strokeWidth={1.75} aria-hidden />
          <span className="flex-1 text-left">{t("search")}</span>
          <kbd className="rounded-md border px-1.5 py-0.5 font-mono text-[10px]">{shortcut}</kbd>
        </button>
      </div>

      <nav aria-label={ts("main")} className="space-y-0.5">
        <NavItem href="/app" icon={House} label={ts("home")} active={pathname === "/app"} />
        {daily.map((x) => (
          <NavItem key={x.key} href={x.href} icon={x.icon} label={x.label} active={x.active} badge={x.badge} />
        ))}
        <NavItem href="/app/agenda" icon={CalendarClock} label={ts("agenda")} active={pathname.startsWith("/app/agenda")} />
      </nav>

      <div>
        {/* En móvil este panel ya es «Más»: se muestra todo abierto. */}
        <button
          type="button"
          aria-expanded={showMore}
          aria-controls="sidebar-more"
          onClick={() => setMoreOpen(!showMore)}
          className="flex min-h-10 w-full max-md:hidden items-center gap-2 rounded-xl px-2 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex-1 text-left">{ts("more")}</span>
          <ChevronDown className={cn("size-4 transition-transform", showMore && "rotate-180")} aria-hidden />
        </button>
        <div id="sidebar-more" className={cn("space-y-3 pt-1", !showMore && "md:hidden")}>
          {more.length > 0 && (
            <nav aria-label={ts("moreTools")} className="space-y-0.5">
              {more.map((x) => (
                <NavItem key={x.path} href={x.href} icon={x.icon} label={t(x.label)} active={x.active} size="sm" />
              ))}
            </nav>
          )}
          <nav aria-label={ts("account")} className="space-y-0.5 border-t border-sidebar-border pt-3">
            {account.map((x) => (
              <NavItem key={x.href} href={x.href} icon={x.icon} label={x.label} active={x.active} size="sm" />
            ))}
          </nav>
        </div>
      </div>

      <div className="mt-auto space-y-3 border-t border-sidebar-border pt-4">
        <Link href="/app/billing" className="flex min-h-11 items-center justify-between rounded-2xl bg-sidebar-accent px-3 py-2 outline-none hover:ring-1 hover:ring-border-strong focus-visible:ring-3 focus-visible:ring-ring/50">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-brand-amber/15 text-brand-amber-ink">
              <Coins className="size-4" />
            </span>
            {tcr("balance")}
          </span>
          <span className="font-mono text-sm font-semibold tabular-nums" title={tcr("of", { max: monthlyCredits })}>
            {credits}
          </span>
        </Link>
        <NavItem href="/app/settings" icon={Settings} label={t("settings")} active={pathname.startsWith("/app/settings")} size="sm" />
        <div className="truncate px-2 text-xs text-muted-foreground" title={email}>
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
      {/* Cabecera móvil: el proyecto actual a un toque (selector en hoja inferior), buscar y avisos. */}
      <div className="fixed inset-x-0 top-0 z-30 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <div className="flex h-14 items-center gap-1 px-2">
          <Link href="/app" aria-label="Kreo" className="grid size-11 shrink-0 place-items-center rounded-full">
            <KreoMark className="size-6" />
          </Link>
          <ProjectSwitcherTrigger current={current} onOpen={() => setSwitcherOpen(true)} compact />
          <Button variant="ghost" size="icon" aria-label={tm("search")} onClick={() => setPaletteOpen(true)}>
            <Search />
          </Button>
          <NotificationBell initialUnread={unreadNotifications} align="end" />
        </div>
      </div>

      {/* Barra de pestañas inferior en móvil: las acciones clave y «Crear» en el centro, al alcance del pulgar. */}
      <nav aria-label={t("mobileTabs")} className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="grid grid-cols-5">
          {tabs.map(tab)}
          <li>
            <CreateMenu currentProject={current} variant="fab" />
          </li>
          {tabsRight.map(tab)}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={open}
              className={cn("flex min-h-14 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none focus-visible:bg-accent", moreTabActive ? "text-foreground" : "text-muted-foreground")}
            >
              <span className={cn("grid h-7 w-12 place-items-center rounded-full", moreTabActive && "bg-primary text-primary-foreground")}>
                <Menu className="size-5" strokeWidth={1.75} aria-hidden />
              </span>
              {t("more")}
            </button>
          </li>
        </ul>
      </nav>

      {open && <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setOpen(false)} />}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} projects={projects} currentProject={current} inProject={inProject} />
      <ProjectSwitcher
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
        projects={projects}
        recentIds={recent}
        current={current}
        pathname={pathname}
        workspace={workspace}
        workspaces={workspaces}
      />
      <aside
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar transition-transform md:sticky md:top-0 md:h-screen md:w-64 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {sidebar}
      </aside>
    </>
  );
}
