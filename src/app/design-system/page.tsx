import type { Metadata } from "next";
import { CalendarDays, Coins, Eye, Heart, Inbox, Plus, Search, Sparkles, TrendingUp, Users } from "lucide-react";
import { KreoLogo, KreoMark } from "@/components/brand/logo";
import { AiBadge } from "@/components/kreo/ai-badge";
import { CreditCost } from "@/components/kreo/credit-cost";
import { StatCard } from "@/components/kreo/stat-card";
import { StatusBadge } from "@/components/kreo/status-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export const metadata: Metadata = { title: "Design system" };

const colorTokens = [
  ["background", "Fondo"],
  ["card", "Superficie"],
  ["secondary", "Superficie 2"],
  ["border", "Borde"],
  ["foreground", "Texto"],
  ["muted-foreground", "Texto secundario"],
  ["primary", "Primario (cian)"],
  ["brand-magenta", "Acento (magenta)"],
  ["success", "Éxito"],
  ["warning", "Aviso"],
  ["destructive", "Error"],
  ["info", "Info"],
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <KreoLogo className="h-9" />
          <p className="text-sm text-muted-foreground">Design system · tokens en <code className="font-mono">globals.css</code>, guía en <code className="font-mono">docs/brand.md</code></p>
        </div>
        <ThemeToggle />
      </header>

      <Section title="Logo">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="grid h-32 place-items-center">
              <KreoLogo className="h-10" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid h-32 place-items-center">
              <KreoMark className="size-16" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid h-32 place-items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/kreo-app-icon.svg" alt="Icono de app de Kreo" className="size-16" />
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Color">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {colorTokens.map(([token, name]) => (
            <div key={token} className="min-w-0">
              <div className="h-14 rounded-lg border" style={{ background: `var(--${token})` }} />
              <div className="mt-1.5 text-sm font-medium">{name}</div>
              <div className="truncate font-mono text-xs text-muted-foreground">--{token}</div>
            </div>
          ))}
        </div>
        <div className="h-14 rounded-lg bg-brand-gradient" />
      </Section>

      <Section title="Tipografía">
        <Card>
          <CardContent className="space-y-3">
            <p className="font-heading text-5xl font-semibold tracking-tight">Crea, programa y crece.</p>
            <p className="font-heading text-2xl font-semibold">Títulos · Sora</p>
            <p className="max-w-2xl text-muted-foreground">
              Texto · Inter. Todas tus marcas, cuentas y contenidos en un solo lugar. La IA propone, tú decides.
            </p>
            <p className="font-mono text-sm tabular-nums text-primary">Datos · JetBrains Mono · ER 6.42% · 1,284,330 views</p>
          </CardContent>
        </Card>
      </Section>

      <Section title="Botones">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Programar</Button>
          <Button variant="brand">
            <Sparkles /> Generar
          </Button>
          <Button variant="secondary">Guardar borrador</Button>
          <Button variant="outline">Vista previa</Button>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="destructive">Eliminar</Button>
          <Button variant="link">Ver más</Button>
          <Button size="icon" variant="outline" aria-label="Nuevo">
            <Plus />
          </Button>
          <Button disabled>Desactivado</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Pequeño</Button>
          <Button>Normal</Button>
          <Button size="lg">Grande</Button>
        </div>
      </Section>

      <Section title="Estados, etiquetas y coste">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status="draft" />
          <StatusBadge status="pending_approval" />
          <StatusBadge status="scheduled" />
          <StatusBadge status="published" />
          <StatusBadge status="error" />
          <AiBadge />
          <CreditCost credits={4} />
          <Badge>Nuevo</Badge>
          <Badge variant="secondary">TikTok</Badge>
          <Badge variant="outline">Próximamente</Badge>
        </div>
        <div className="flex items-center gap-4 text-muted-foreground">
          {[TrendingUp, CalendarDays, Sparkles, Inbox, Search].map((Icon, i) => (
            <Icon key={i} className="size-5" strokeWidth={1.75} aria-hidden />
          ))}
          <span className="text-xs">Lucide · trazo 1.75 px</span>
        </div>
      </Section>

      <Section title="Tarjetas de estadísticas">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Seguidores" value="48,2K" delta="+12 % vs. mes anterior" icon={Users} />
          <StatCard label="Views" value="1,28M" delta="+38 %" icon={Eye} />
          <StatCard label="Engagement" value="6,4 %" delta="−0,3 pt" trend="down" icon={Heart} />
          <StatCard label="Créditos" value="820" delta="de 1.000 este mes" trend="flat" icon={Coins} />
        </div>
      </Section>

      <Section title="Formularios">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Nueva publicación</CardTitle>
              <CardDescription>La IA propone el caption; tú lo apruebas antes de programar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ds-title">Título interno</Label>
                <Input id="ds-title" placeholder="Rutina de noche en 3 pasos" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ds-caption">Caption</Label>
                <Textarea id="ds-caption" placeholder="Escribe o genera un caption…" />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="ds-ai" defaultChecked />
                <Label htmlFor="ds-ai">Etiquetar como contenido generado con IA</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="ds-variations" defaultChecked />
                <Label htmlFor="ds-variations">Crear variaciones por cuenta (evita contenido idéntico)</Label>
              </div>
            </CardContent>
            <CardFooter className="justify-between">
              <CreditCost credits={2} />
              <div className="flex gap-2">
                <Button variant="ghost">Cancelar</Button>
                <Button>Enviar a aprobación</Button>
              </div>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pestañas</CardTitle>
              <CardDescription>Vistas del calendario.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="month">
                <TabsList>
                  <TabsTrigger value="month">Mes</TabsTrigger>
                  <TabsTrigger value="week">Semana</TabsTrigger>
                  <TabsTrigger value="list">Lista</TabsTrigger>
                </TabsList>
                <TabsContent value="month" className="pt-4 text-sm text-muted-foreground">Vista mensual.</TabsContent>
                <TabsContent value="week" className="pt-4 text-sm text-muted-foreground">Vista semanal.</TabsContent>
                <TabsContent value="list" className="pt-4 text-sm text-muted-foreground">Vista de lista.</TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </Section>
    </div>
  );
}
