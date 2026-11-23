import {
  BarChart3,
  CalendarClock,
  House,
  CalendarDays,
  FileBarChart,
  Flame,
  FolderKanban,
  HandCoins,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  Map,
  PackageSearch,
  Palette,
  Plug,
  Scissors,
  Settings,
  ShoppingBag,
  Sparkles,
  Swords,
  Users,
  Coins,
} from "lucide-react";

export type NavIcon = typeof LayoutDashboard;

/** Navegación del proyecto agrupada por intención. Cada ruta la implementa su módulo. `label` es una clave de `nav`. */
export const PROJECT_NAV: { label: string; items: { path: string; icon: NavIcon; label: string; also?: string[] }[] }[] = [
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

/** Secciones fuera de un proyecto (las de la cuenta / workspace). `label` es una clave de `nav`. */
export const GLOBAL_NAV: { href: string; icon: NavIcon; label: string }[] = [
  { href: "/app", icon: House, label: "home" },
  { href: "/app/agenda", icon: CalendarClock, label: "agenda" },
  { href: "/app/projects", icon: FolderKanban, label: "projects" },
  { href: "/app/calendar", icon: CalendarDays, label: "globalCalendar" },
  { href: "/app/team", icon: Users, label: "team" },
  { href: "/app/affiliates", icon: HandCoins, label: "affiliates" },
  { href: "/app/settings", icon: Settings, label: "settings" },
  { href: "/app/billing", icon: Coins, label: "planCredits" },
];

/** Rutas de las acciones de "Crear". */
export const createHrefs = {
  newPost: (projectId: string) => `/app/p/${projectId}/posts/new`,
  generate: (projectId: string) => `/app/p/${projectId}/studio`,
  newProject: "/app/projects/new",
  agendaBlock: "/app/agenda?new=1",
};

/** Normaliza para buscar: minúsculas y sin acentos ("Análisis" → "analisis"). */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** ¿Coinciden todas las palabras de la consulta con el texto (en cualquier orden)? */
export function matchesQuery(text: string, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const hay = normalizeSearch(text);
  return q.split(/\s+/).every((word) => hay.includes(word));
}
