# Kreo · Guía de marca y design system

**Nombre:** Kreo ("creo" / crear). **Dirección visual:** A · Terminal de crecimiento (elegida en Fase 0, 2026-11-18).
**Claim:** *Crea, programa y crece.*

> Pendiente por parte de Oier: comprobar dominio (kreo.com / .io / .app) y marca en EUIPO, OEPM y TMview
> (clases 9, 35 y 42). Existen al menos "Kreo" (software de construcción) y "Kre-O" (juguetes), así que conviene
> la opinión de un agente de propiedad industrial antes de registrar.

## Personalidad
Herramienta de pro: oscura, precisa, orientada a datos. Se siente como un terminal de crecimiento.
Fuerte con dropshippers, growth y creadores que viven en las métricas.

## Logo
| Archivo | Uso |
|---|---|
| `public/brand/kreo-logo-on-dark.svg` | Logo completo sobre fondos oscuros |
| `public/brand/kreo-logo-on-light.svg` | Logo completo sobre fondos claros (verde oliva en vez de lima) |
| `public/brand/kreo-mark.svg` | Símbolo solo (triángulo de crecimiento) |
| `public/brand/kreo-app-icon.svg` · `src/app/icon.svg` | Icono de app / favicon |
| `src/components/brand/logo.tsx` | `<KreoLogo />` (prop `blink` para animar el cursor) y `<KreoMark />` |

- Wordmark: "kreo" en minúsculas, **Space Grotesk Bold**, tracking −2 %, convertido a trazos.
- Símbolo: triángulo rectángulo lima = gráfica que sube. Cursor de terminal "_" al final del nombre.
- El cursor solo parpadea en la landing/hero, y nunca si el usuario tiene "reducir movimiento" activado.
- Zona de respeto: la altura de la "k" alrededor. Tamaño mínimo: 20 px de alto (símbolo 16 px).
- No: lima sobre fondos claros (usa la versión on-light), deformar, sombras, degradados.

## Color
Tokens en `src/app/globals.css` (`:root` = claro, `.dark` = oscuro, **oscuro por defecto**).
En Tailwind: `bg-background`, `text-muted-foreground`, `bg-primary`, `text-primary-ink`, `bg-brand-amber`, `text-success`...

> **Regla del lima:** `--primary` (#C6F432) es para **rellenos** con texto oscuro encima (botones, badges, resaltados).
> Para texto o iconos en color usa **`text-primary-ink`**: lima en oscuro y verde oliva #4A7300 en claro (contraste AA).

| Token | Oscuro | Claro | Uso |
|---|---|---|---|
| `--background` | `#0A0C08` | `#F3F5EC` | Fondo de página |
| `--card` / `--popover` | `#12150E` | `#FFFFFF` | Superficies |
| `--secondary` / `--muted` | `#1A1E14` | `#E9EDDF` | Superficie 2 |
| `--accent` | `#20251A` | `#E1E6D3` | Hover de menús |
| `--border` | `#272C1F` | `#D5DBC7` | Bordes |
| `--input` | `#333A28` | `#C3CAB2` | Bordes de inputs |
| `--foreground` | `#E9EFE0` | `#11140C` | Texto |
| `--muted-foreground` | `#8A9480` | `#5D6654` | Texto secundario |
| `--primary` | `#C6F432` | `#C6F432` | Relleno de acción principal |
| `--primary-foreground` | `#0A0C08` | `#0A0C08` | Texto sobre lima |
| `--primary-ink` | `#C6F432` | `#4A7300` | Lima como color de texto/enlace |
| `--brand-mark` | `#C6F432` | `#5E9100` | Símbolo del logo |
| `--brand-amber` | `#FFB547` | `#FFB547` | Acciones de IA ("Generar"), segunda serie |
| `--brand-amber-ink` | `#FFB547` | `#A15C00` | Ámbar como texto/icono |
| `--success` | `#7CF29A` | `#1E8A4C` | Publicado, subidas |
| `--warning` | `#FFB547` | `#B56A00` | Pendiente, avisos anti-baneo |
| `--destructive` | `#FF5C5C` | `#D63B3B` | Errores, borrar |
| `--info` | `#6CC6FF` | `#1F6FB2` | Información |
| `--chart-1…5` | lima, ámbar, azul, violeta, rojo | versiones oscuras | Series de gráficas, en ese orden |

## Tipografía (Google Fonts, licencia SIL OFL, auto-alojadas con `next/font`)
| Rol | Fuente | Clase | Uso |
|---|---|---|---|
| Títulos y texto | Space Grotesk | `font-heading` / `font-sans` | Toda la interfaz |
| Datos | JetBrains Mono | `font-mono` + `tabular-nums` | Métricas, KPIs, horas, créditos, IDs |
| Etiquetas | JetBrains Mono, MAYÚSCULAS, +12 % tracking | `label-mono` | Títulos de sección y de tarjeta |

## Forma, espacio e iconos
- Radio base `--radius: 0.375rem` (6 px): esquinas casi rectas. Botones `rounded-md`, badges `rounded-sm`.
- Iconos: **Lucide**, trazo 1.5 px, sin relleno. 16 px en interfaz, 20 px en navegación.
- Espaciado en múltiplos de 4 px. Elemento activo del menú lateral: barra lima de 2 px a la izquierda.
- Gráficas con rejilla discontinua.

## Componentes
- Base: shadcn/ui (estilo *radix-nova*) en `src/components/ui/`, personalizados con los tokens anteriores.
  Botón con variante extra `brand` (ámbar) para acciones de IA.
- Propios de Kreo en `src/components/kreo/`:
  - `StatusBadge`: borrador · pendiente de aprobación · programado · publicado · error.
  - `AiBadge`: etiqueta "Generado con IA" (obligatoria; AI Act + etiquetas de las plataformas).
  - `CreditCost`: coste en créditos, que se muestra siempre **antes** de cualquier acción de pago.
  - `StatCard`: KPI con variación.
- Escaparate en vivo: **`/design-system`** (con conmutador de modo claro/oscuro).

## Tono de voz
Directo, técnico y con números. Frases cortas, sin relleno. Segunda persona ("tú"). Sin promesas de viralidad.
Ejemplos: "+38 % de views esta semana. Tu mejor hora: 19:00." · "3 posts listos. Apruébalos y salen a su hora." ·
"Outlier detectado: 6,2× la media del canal."

## Accesibilidad
- Contraste WCAG AA comprobado para texto principal, secundario y botones en los dos modos.
- Foco visible (`ring` lima en oscuro, verde en claro) en todos los controles. No usar solo color para transmitir estado: los badges llevan texto.

## Accesibilidad y HIG de Apple (revisión 2026-11-19)
- Contrastes medidos (WCAG): texto principal 17,6:1 (oscuro) / 17,9:1 (claro); texto secundario 7,5:1 / 5,3:1.
- Límites de campos (`--input`) ≥ 3:1: `#5a6455` en oscuro (3,1:1), `#949494` en claro (3,0:1).
- Estado seleccionado: token `--selected` (`border-selected`). En claro `#5e9100` (3,8:1); la lima pura sobre blanco da 1,3:1 y no se usa para indicar estado.
- Aviso (`--warning`) en claro `#a3480a`: 5,2:1 sobre su fondo.
- Pantallas táctiles: botones y campos de al menos 44 px (`@media (pointer: coarse)`).
- `prefers-reduced-motion` desactiva animaciones y transiciones; `prefers-contrast: more` refuerza bordes y texto secundario.
- El tema sigue al del sistema por defecto; el botón de tema vuelve a "sistema" si eliges lo mismo que el sistema.
- El aviso de cookies reserva su altura al final de la página: nunca tapa botones.
