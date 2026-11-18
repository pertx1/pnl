"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  BarChart3,
  CalendarDays,
  Inbox,
  LayoutDashboard,
  Moon,
  Search,
  ShoppingBag,
  Sparkles,
  Sun,
  TrendingUp,
  Users,
  Eye,
  Heart,
  Coins,
  Plus,
} from "lucide-react";
import { candidateNames, directions, type Direction } from "./themes";

// ---------- helpers ----------

function vars(d: Direction, mode: "dark" | "light"): CSSProperties {
  const t = d.modes[mode];
  return {
    "--bg": t.bg,
    "--surface": t.surface,
    "--surface2": t.surface2,
    "--border": t.border,
    "--text": t.text,
    "--muted": t.muted,
    "--primary": t.primary,
    "--primary-fg": t.primaryFg,
    "--primary-ink": t.primaryInk,
    "--accent": t.accent,
    "--accent-fg": t.accentFg,
    "--success": t.success,
    "--warning": t.warning,
    "--danger": t.danger,
    "--r-lg": d.radius.lg,
    "--r-md": d.radius.md,
    "--r-sm": d.radius.sm,
    "--r-pill": d.radius.pill,
    "--f-display": d.fonts.display,
    "--f-body": d.fonts.body,
    "--f-mono": d.fonts.mono,
  } as CSSProperties;
}

const series = [12, 18, 15, 22, 28, 24, 31, 35, 30, 42, 47, 44, 53, 61];
const series2 = [8, 10, 12, 11, 14, 17, 15, 19, 22, 21, 24, 27, 26, 30];

function path(data: number[], w: number, h: number, close = false) {
  const max = Math.max(...data) * 1.1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - (v / max) * h]);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
  if (close) d += ` L ${w} ${h} L 0 ${h} Z`;
  return d;
}

// ---------- logo ----------

function Logo({ d, name, size = 28 }: { d: Direction; name: string; size?: number }) {
  if (d.logoStyle === "cursor") {
    return (
      <span
        className="inline-flex items-center font-bold tracking-tight"
        style={{ fontFamily: "var(--f-display)", fontSize: size, color: "var(--text)" }}
      >
        <span
          aria-hidden
          className="mr-2 inline-block"
          style={{
            width: size * 0.55,
            height: size * 0.55,
            background: "var(--primary)",
            borderRadius: 2,
            clipPath: "polygon(0 100%, 100% 0, 100% 100%)",
          }}
        />
        {name.toLowerCase()}
        <span
          aria-hidden
          className="ml-1 inline-block animate-pulse"
          style={{ width: size * 0.45, height: size * 0.12, background: "var(--primary)", alignSelf: "flex-end", marginBottom: size * 0.18 }}
        />
      </span>
    );
  }
  if (d.logoStyle === "dot") {
    return (
      <span
        className="inline-flex items-baseline font-extrabold"
        style={{ fontFamily: "var(--f-display)", fontSize: size, color: "var(--text)", letterSpacing: "-0.03em" }}
      >
        {name}
        <span
          aria-hidden
          className="ml-0.5 inline-block rounded-full"
          style={{ width: size * 0.28, height: size * 0.28, background: "var(--accent)" }}
        />
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center font-semibold uppercase"
      style={{ fontFamily: "var(--f-display)", fontSize: size * 0.8, color: "var(--text)", letterSpacing: "0.18em" }}
    >
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="mr-2.5">
        <defs>
          <linearGradient id={`g-${name}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--primary)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="11" fill="none" stroke={`url(#g-${name})`} strokeWidth="3.5" />
        <circle cx="25" cy="8" r="3.5" fill="var(--accent)" />
      </svg>
      {name}
    </span>
  );
}

// ---------- primitives ----------

function Card({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`border p-5 ${className}`}
      style={{ background: "var(--surface)", borderColor: "var(--border)", borderRadius: "var(--r-lg)", ...style }}
    >
      {children}
    </div>
  );
}

function Label({ d, children }: { d: Direction; children: ReactNode }) {
  const mono = d.id === "terminal";
  return (
    <span
      className={mono ? "text-[11px] uppercase tracking-[0.12em]" : "text-xs font-medium"}
      style={{ color: "var(--muted)", fontFamily: mono ? "var(--f-mono)" : "var(--f-body)" }}
    >
      {children}
    </span>
  );
}

function Btn({ variant, children }: { variant: "primary" | "secondary" | "ghost" | "accent"; children: ReactNode }) {
  const styles: Record<string, CSSProperties> = {
    primary: { background: "var(--primary)", color: "var(--primary-fg)", borderColor: "var(--primary)" },
    accent: { background: "var(--accent)", color: "var(--accent-fg)", borderColor: "var(--accent)" },
    secondary: { background: "var(--surface2)", color: "var(--text)", borderColor: "var(--border)" },
    ghost: { background: "transparent", color: "var(--primary-ink)", borderColor: "transparent" },
  };
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 border px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ ...styles[variant], borderRadius: "var(--r-pill)", fontFamily: "var(--f-body)", outlineColor: "var(--primary)" }}
    >
      {children}
    </button>
  );
}

function Pill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        borderRadius: "var(--r-pill)",
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

function IconTile({ d, children }: { d: Direction; children: ReactNode }) {
  if (d.id !== "estudio") return <span style={{ color: "var(--primary-ink)" }}>{children}</span>;
  return (
    <span
      className="inline-grid h-9 w-9 place-items-center"
      style={{
        background: "color-mix(in srgb, var(--primary) 14%, transparent)",
        color: "var(--primary-ink)",
        borderRadius: "var(--r-sm)",
      }}
    >
      {children}
    </span>
  );
}

// ---------- blocks ----------

function StatCard({ d }: { d: Direction }) {
  const w = 260;
  const h = 64;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <Label d={d}>Views · últimos 14 días</Label>
        <IconTile d={d}>
          <Eye size={18} strokeWidth={d.icons.stroke} />
        </IconTile>
      </div>
      <div className="mt-2 flex items-end gap-3">
        <span
          className="text-4xl font-bold tabular-nums"
          style={{ fontFamily: d.id === "terminal" ? "var(--f-mono)" : "var(--f-display)", color: "var(--text)" }}
        >
          1,28M
        </span>
        <Pill color="var(--success)">+38,4 %</Pill>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-16 w-full" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id={`area-${d.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--primary)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={path(series, w, h, true)} fill={`url(#area-${d.id})`} />
        <path d={path(series, w, h)} fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
        vs. 924K los 14 días anteriores
      </p>
    </Card>
  );
}

function Palette({ d, mode }: { d: Direction; mode: "dark" | "light" }) {
  const t = d.modes[mode];
  const swatches: [string, string][] = [
    ["Fondo", t.bg],
    ["Superficie", t.surface],
    ["Borde", t.border],
    ["Texto", t.text],
    ["Secundario", t.muted],
    ["Primario", t.primary],
    ["Acento", t.accent],
    ["Éxito", t.success],
    ["Aviso", t.warning],
    ["Error", t.danger],
  ];
  return (
    <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
      {swatches.map(([name, hex]) => (
        <div key={name} className="min-w-0">
          <div
            className="h-12 border"
            style={{ background: hex, borderColor: "var(--border)", borderRadius: "var(--r-sm)" }}
          />
          <div className="mt-1 truncate text-[11px] font-medium" style={{ color: "var(--text)" }}>
            {name}
          </div>
          <div className="truncate text-[10px] uppercase" style={{ color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
            {hex}
          </div>
        </div>
      ))}
    </div>
  );
}

function Dashboard({ d, name }: { d: Direction; name: string }) {
  const nav = [
    [LayoutDashboard, "Panel"],
    [CalendarDays, "Calendario"],
    [Sparkles, "Estudio IA"],
    [BarChart3, "Analíticas"],
    [Search, "Competencia"],
    [ShoppingBag, "Productos"],
    [Inbox, "Bandeja"],
  ] as const;
  const kpis = [
    [Users, "Seguidores", "48,2K", "+12 %"],
    [Eye, "Views", "1,28M", "+38 %"],
    [Heart, "Engagement", "6,4 %", "+0,8 pt"],
    [Coins, "Créditos", "820", "de 1.000"],
  ] as const;
  const posts = [
    ["Hoy · 19:00", "3 trucos para tu skincare de noche", "TikTok + IG", "Programado", "var(--success)", true],
    ["Mañana · 13:30", "Unboxing edición limitada", "YouTube Shorts", "Pendiente de aprobación", "var(--warning)", false],
    ["Vie · 18:00", "Detrás de cámaras del shooting", "Instagram", "Borrador", "var(--muted)", true],
  ] as const;
  const w = 520;
  const h = 140;

  return (
    <div
      className="overflow-hidden border"
      style={{ borderColor: "var(--border)", borderRadius: "var(--r-lg)", background: "var(--bg)" }}
    >
      <div className="flex min-h-[460px]">
        {/* sidebar */}
        <aside
          className="hidden w-52 shrink-0 flex-col gap-1 border-r p-4 md:flex"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="mb-4">
            <Logo d={d} name={name} size={20} />
          </div>
          <div
            className="mb-3 flex items-center justify-between border px-2.5 py-2 text-xs"
            style={{ borderColor: "var(--border)", borderRadius: "var(--r-md)", color: "var(--text)" }}
          >
            <span className="truncate">Proyecto: Lumi Skin</span>
            <span style={{ color: "var(--muted)" }}>▾</span>
          </div>
          {nav.map(([Icon, label], i) => (
            <div
              key={label}
              className="flex items-center gap-2.5 px-2.5 py-2 text-sm"
              style={{
                borderRadius: "var(--r-md)",
                background: i === 0 ? "var(--surface2)" : "transparent",
                color: i === 0 ? "var(--text)" : "var(--muted)",
                fontWeight: i === 0 ? 600 : 500,
                boxShadow: i === 0 && d.id === "terminal" ? "inset 2px 0 0 var(--primary)" : undefined,
              }}
            >
              <Icon size={16} strokeWidth={d.icons.stroke} style={{ color: i === 0 ? "var(--primary-ink)" : undefined }} />
              {label}
            </div>
          ))}
        </aside>

        {/* main */}
        <main className="min-w-0 flex-1 p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <Label d={d}>Lumi Skin · 4 cuentas conectadas</Label>
              <h3 className="text-xl font-bold" style={{ fontFamily: "var(--f-display)", color: "var(--text)" }}>
                {d.id === "estudio" ? "¡Hola, Oier! 👋" : d.id === "terminal" ? "panel / resumen" : "Resumen de rendimiento"}
              </h3>
            </div>
            <Btn variant="primary">
              <Plus size={16} strokeWidth={2} /> Crear contenido
            </Btn>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map(([Icon, label, value, delta]) => (
              <Card key={label} className="!p-4">
                <div className="flex items-center justify-between">
                  <Label d={d}>{label}</Label>
                  <Icon size={15} strokeWidth={d.icons.stroke} style={{ color: "var(--muted)" }} />
                </div>
                <div
                  className="mt-1 text-2xl font-bold tabular-nums"
                  style={{ fontFamily: d.id === "terminal" ? "var(--f-mono)" : "var(--f-display)", color: "var(--text)" }}
                >
                  {value}
                </div>
                <div className="text-xs" style={{ color: label === "Créditos" ? "var(--muted)" : "var(--success)" }}>
                  {delta}
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <div className="flex items-center justify-between">
                <Label d={d}>Alcance por red</Label>
                <div className="flex gap-3 text-[11px]" style={{ color: "var(--muted)" }}>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: "var(--primary)" }} /> TikTok
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} /> Instagram
                  </span>
                </div>
              </div>
              <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-36 w-full" preserveAspectRatio="none" aria-hidden>
                {[0.25, 0.5, 0.75].map((y) => (
                  <line key={y} x1="0" x2={w} y1={h * y} y2={h * y} stroke="var(--border)" strokeDasharray={d.id === "terminal" ? "2 4" : undefined} />
                ))}
                <path d={path(series, w, h)} fill="none" stroke="var(--primary)" strokeWidth="2.25" vectorEffect="non-scaling-stroke" />
                <path d={path(series2, w, h)} fill="none" stroke="var(--accent)" strokeWidth="2.25" vectorEffect="non-scaling-stroke" />
              </svg>
            </Card>

            <Card className="lg:col-span-2">
              <Label d={d}>Próximas publicaciones</Label>
              <ul className="mt-3 space-y-3">
                {posts.map(([when, title, net, status, color, ai]) => (
                  <li key={title} className="border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px]" style={{ color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
                        {when}
                      </span>
                      <Pill color={color}>{status}</Pill>
                    </div>
                    <div className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>
                      {title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px]" style={{ color: "var(--muted)" }}>
                      {net}
                      {ai && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-px"
                          style={{ border: "1px solid var(--border)", borderRadius: "var(--r-sm)" }}
                        >
                          <Sparkles size={10} /> Generado con IA
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}

// ---------- direction section ----------

function DirectionSection({ d, name }: { d: Direction; name: string }) {
  const [mode, setMode] = useState<"dark" | "light">(d.defaultMode);
  const alt = mode === "dark" ? "light" : "dark";

  return (
    <section
      id={d.id}
      className="scroll-mt-20 px-4 py-14 sm:px-8"
      style={{ ...vars(d, mode), background: "var(--bg)", color: "var(--text)", fontFamily: "var(--f-body)" }}
    >
      <div className="mx-auto max-w-6xl">
        {/* header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Label d={d}>{d.label}</Label>
            <h2 className="mt-1 max-w-2xl text-2xl font-bold sm:text-3xl" style={{ fontFamily: "var(--f-display)" }}>
              {d.tagline}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setMode(alt)}
            className="inline-flex items-center gap-2 border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: "var(--border)", borderRadius: "var(--r-pill)", background: "var(--surface)" }}
          >
            {alt === "dark" ? <Moon size={14} /> : <Sun size={14} />}
            Ver modo {alt === "dark" ? "oscuro" : "claro"}
          </button>
        </div>

        {/* logo + type */}
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <Card className="flex flex-col justify-between gap-6">
            <Label d={d}>Logo tipográfico</Label>
            <div className="py-4">
              <Logo d={d} name={name} size={40} />
            </div>
            <div className="flex items-center gap-3">
              <span
                className="grid h-12 w-12 place-items-center"
                style={{ background: "var(--primary)", borderRadius: "var(--r-md)" }}
                aria-label="Favicon"
              >
                <span className="text-2xl font-bold" style={{ color: "var(--primary-fg)", fontFamily: "var(--f-display)" }}>
                  {name[0]}
                </span>
              </span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Favicon / icono de app
              </span>
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <Label d={d}>Tipografía (Google Fonts · licencia OFL)</Label>
            <div className="mt-3 text-4xl font-bold leading-tight sm:text-5xl" style={{ fontFamily: "var(--f-display)" }}>
              Crea, programa y crece.
            </div>
            <p className="mt-3 max-w-xl text-base" style={{ color: "var(--muted)" }}>
              Todas tus marcas, cuentas y contenidos en un solo lugar. La IA propone, tú decides.
            </p>
            <div className="mt-4 text-sm tabular-nums" style={{ fontFamily: "var(--f-mono)", color: "var(--primary-ink)" }}>
              ER 6.42% · CTR 3.1% · 1,284,330 views
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs" style={{ color: "var(--muted)" }}>
              <span>Títulos: <b style={{ color: "var(--text)" }}>{d.fontNames.display}</b></span>
              <span>Texto: <b style={{ color: "var(--text)" }}>{d.fontNames.body}</b></span>
              <span>Datos: <b style={{ color: "var(--text)" }}>{d.fontNames.mono}</b></span>
            </div>
          </Card>
        </div>

        {/* palette */}
        <Card className="mt-4">
          <div className="mb-3">
            <Label d={d}>Paleta · modo {mode === "dark" ? "oscuro" : "claro"}</Label>
          </div>
          <Palette d={d} mode={mode} />
        </Card>

        {/* buttons + stat + voice */}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card>
            <Label d={d}>Botones</Label>
            <div className="mt-4 flex flex-wrap gap-2">
              <Btn variant="primary">Programar</Btn>
              <Btn variant="accent">
                <Sparkles size={15} strokeWidth={d.icons.stroke} /> Generar
              </Btn>
              <Btn variant="secondary">Guardar borrador</Btn>
              <Btn variant="ghost">Cancelar</Btn>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Pill color="var(--success)">Publicado</Pill>
              <Pill color="var(--warning)">Pendiente</Pill>
              <Pill color="var(--danger)">Error</Pill>
              <Pill color="var(--primary-ink)">Programado</Pill>
            </div>
            <div className="mt-5 flex items-center gap-3" style={{ color: "var(--muted)" }}>
              {[TrendingUp, CalendarDays, Sparkles, Inbox, Search].map((Icon, i) => (
                <IconTile key={i} d={d}>
                  <Icon size={18} strokeWidth={d.icons.stroke} />
                </IconTile>
              ))}
            </div>
            <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
              Iconos: <b style={{ color: "var(--text)" }}>{d.icons.set}</b>. {d.icons.note}
            </p>
          </Card>

          <StatCard d={d} />

          <Card>
            <Label d={d}>Tono de voz</Label>
            <p className="mt-2 text-sm font-semibold">{d.voice.summary}</p>
            <ul className="mt-3 space-y-2">
              {d.voice.samples.map((s) => (
                <li
                  key={s}
                  className="px-3 py-2 text-sm"
                  style={{ background: "var(--surface2)", borderRadius: "var(--r-md)" }}
                >
                  {s}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
              <b style={{ color: "var(--text)" }}>Atrae a:</b> {d.audience}
            </p>
          </Card>
        </div>

        {/* dashboard */}
        <div className="mt-8">
          <div className="mb-3">
            <Label d={d}>Pantalla de ejemplo · dashboard</Label>
          </div>
          <Dashboard d={d} name={name} />
        </div>
      </div>
    </section>
  );
}

// ---------- page ----------

export default function BrandPreview() {
  const [name, setName] = useState<string>(candidateNames[0]);
  const [custom, setCustom] = useState("");
  const shown = custom.trim() || name;

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-8">
          <span className="text-sm font-bold">Fase 0 · Brand preview</span>
          <nav className="flex gap-3 text-sm text-neutral-600">
            {directions.map((d) => (
              <a key={d.id} href={`#${d.id}`} className="hover:text-neutral-900 hover:underline">
                {d.label.split(" · ")[0]} · {d.label.split(" · ")[1]}
              </a>
            ))}
          </nav>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-neutral-500">Nombre:</span>
            <select
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setCustom("");
              }}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1"
            >
              {candidateNames.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="u otro…"
              maxLength={14}
              className="w-24 rounded-md border border-neutral-300 bg-white px-2 py-1"
            />
          </label>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-neutral-600 sm:px-8">
        Compara las tres direcciones con el nombre que quieras. Cada sección tiene su modo alternativo (claro/oscuro).
        Los datos del dashboard son ficticios. Página interna: no indexada.
      </div>

      {directions.map((d) => (
        <DirectionSection key={d.id} d={d} name={shown} />
      ))}
    </div>
  );
}
