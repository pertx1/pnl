# Kreo · Guía de marca y design system

**Nombre:** Kreo ("creo" / crear). **Dirección visual:** C · Premium oscuro (elegida en Fase 0, 2026-11-18).
**Claim:** *Crea, programa y crece.*

> Pendiente por parte de Oier: comprobar dominio (kreo.com / .io / .app) y marca en EUIPO, OEPM y TMview
> (clases 9, 35 y 42). Existen al menos "Kreo" (software de construcción) y "Kre-O" (juguetes), así que conviene
> la opinión de un agente de propiedad industrial antes de registrar.

## Por qué la C
- Funciona con creadores y también con agencias y marcas, que son los clientes con más ticket (marca blanca, equipos).
- Contraste AA en claro y oscuro (el lima de la A fallaba como color de texto en modo claro).
- De la A se conserva la idea de **números en mono** para los datos.

## Logo
| Archivo | Uso |
|---|---|
| `public/brand/kreo-logo-on-dark.svg` | Logo completo sobre fondos oscuros |
| `public/brand/kreo-logo-on-light.svg` | Logo completo sobre fondos claros |
| `public/brand/kreo-mark.svg` | Símbolo solo (órbita + satélite) |
| `public/brand/kreo-app-icon.svg` · `src/app/icon.svg` | Icono de app / favicon |
| `src/components/brand/logo.tsx` | `<KreoLogo />` y `<KreoMark />` (se adaptan al tema) |

- Wordmark: "KREO" en **Sora SemiBold**, tracking +16 %, convertido a trazos (no depende de la fuente).
- Símbolo: órbita con degradado cian→magenta y un "satélite" magenta: el contenido que sale a orbitar.
- Zona de respeto: la altura de la "K" alrededor del logo. Tamaño mínimo: 20 px de alto (símbolo 16 px).
- No: cambiar colores del degradado, deformar, añadir sombras, poner el logo sobre fotos sin contraste.

## Color
Tokens en `src/app/globals.css` (`:root` = claro, `.dark` = oscuro, **oscuro por defecto**).
En Tailwind se usan como `bg-background`, `text-muted-foreground`, `bg-primary`, `text-brand-magenta`, `text-success`, etc.

| Token | Oscuro | Claro | Uso |
|---|---|---|---|
| `--background` | `#060A1A` | `#F5F7FD` | Fondo de página |
| `--card` / `--popover` | `#0D1330` | `#FFFFFF` | Superficies |
| `--secondary` / `--muted` | `#131B3F` | `#ECEFFA` | Superficie 2, rellenos suaves |
| `--accent` | `#18214A` | `#E3E8F8` | Hover de menús |
| `--border` | `#1F2A55` | `#D8DEF0` | Bordes |
| `--input` | `#26326A` | `#C9D1EA` | Bordes de inputs |
| `--foreground` | `#EAF0FF` | `#0A1030` | Texto |
| `--muted-foreground` | `#8890B5` | `#596184` | Texto secundario |
| `--primary` | `#22D3EE` | `#0E7490` | Acción principal, enlaces, foco |
| `--primary-foreground` | `#04121A` | `#FFFFFF` | Texto sobre primario |
| `--brand-cyan` | `#22D3EE` | `#0891B2` | Marca (degradado, gráficas) |
| `--brand-magenta` | `#E040FB` | `#B21FCB` | Acento de marca e IA |
| `--success` | `#34D399` | `#059669` | Publicado, subidas |
| `--warning` | `#FBBF24` | `#B45309` | Pendiente, avisos anti-baneo |
| `--destructive` | `#F43F5E` | `#E11D48` | Errores, borrar |
| `--info` | `#818CF8` | `#4F46E5` | Información |
| `--chart-1…5` | cian, magenta, índigo, verde, ámbar | versiones oscuras | Series de gráficas, en ese orden |

Degradado de marca: `bg-brand-gradient` / `text-brand-gradient` (cian → magenta, 135°). Úsalo con moderación:
botón de generar con IA, palabras clave del hero, símbolo. Nunca para texto largo.

## Tipografía (Google Fonts, licencia SIL OFL, auto-alojadas con `next/font`)
| Rol | Fuente | Clase | Uso |
|---|---|---|---|
| Títulos | Sora 600 | `font-heading` (automático en h1–h4) | Titulares, números grandes de KPIs |
| Texto | Inter | `font-sans` (por defecto) | Interfaz y párrafos |
| Datos | JetBrains Mono | `font-mono` + `tabular-nums` | Métricas, horas, créditos, IDs |

## Forma, espacio e iconos
- Radio base `--radius: 0.75rem` (12 px): tarjetas `rounded-xl`, inputs `rounded-lg`, **botones y badges en píldora**.
- Iconos: **Lucide**, trazo 1.75 px, tamaño 16 px en interfaz y 20 px en navegación.
- Espaciado en múltiplos de 4 px; tarjetas con padding de 16–24 px.

## Componentes
- Base: shadcn/ui (estilo *radix-nova*) en `src/components/ui/`, personalizados con los tokens anteriores.
  Botón con variante extra `brand` (degradado) para acciones de IA.
- Propios de Kreo en `src/components/kreo/`:
  - `StatusBadge`: borrador · pendiente de aprobación · programado · publicado · error.
  - `AiBadge`: etiqueta "Generado con IA" (obligatoria; AI Act + etiquetas de las plataformas).
  - `CreditCost`: coste en créditos, que se muestra siempre **antes** de cualquier acción de pago.
  - `StatCard`: KPI con variación.
- Escaparate en vivo: **`/design-system`** (con conmutador de modo claro/oscuro).

## Tono de voz
Profesional, seguro y conciso; habla de resultados. Segunda persona ("tú"). Frases cortas, sin exageraciones
ni promesas de viralidad. Ejemplos: "3 publicaciones esperan tu aprobación." · "Rendimiento semanal: +38 % de alcance."

## Accesibilidad
- Contraste WCAG AA comprobado para texto principal, secundario y botones en los dos modos.
- Foco visible (`ring` cian) en todos los controles. No usar solo color para transmitir estado: los badges llevan texto.
