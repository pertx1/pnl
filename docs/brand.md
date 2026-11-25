# Kreo · Guía de marca y design system

**Nombre:** Kreo ("creo" / crear). **Dirección visual:** C · Creador (elegida por Oier el 2026-11-25) sobre la paleta de la dirección A · Terminal de crecimiento (Fase 0, 2026-11-18): mismos colores, formas y tipografía nuevas.
**Claim:** *Crea, programa y crece.*

> Pendiente por parte de Oier: comprobar dominio (kreo.com / .io / .app) y marca en EUIPO, OEPM y TMview
> (clases 9, 35 y 42). Existen al menos "Kreo" (software de construcción) y "Kre-O" (juguetes), así que conviene
> la opinión de un agente de propiedad industrial antes de registrar.

## Personalidad
Dirección «Creador»: colorida dentro de la paleta, visual y centrada en los vídeos. Formas redondeadas, botones grandes,
títulos con carácter y publicaciones vistas como miniaturas, como en el móvil. Todo a mano: «Crear» siempre visible,
selector de proyectos arriba y contadores de lo que necesita atención. Sigue siendo precisa con los datos
(cifras en mono), pero la primera impresión es la del contenido, no la de un terminal.

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
| Títulos | **Bricolage Grotesque** (variable) | `font-heading`, `page-title`, `section-title`, `h1`–`h4` | Títulos de página, de sección y de tarjeta |
| Texto | Space Grotesk | `font-sans` | Cuerpo, botones, formularios |
| Datos | JetBrains Mono | `font-mono` + `tabular-nums` | Métricas, KPIs, horas, créditos, IDs |
| Etiquetas | JetBrains Mono, MAYÚSCULAS, +12 % tracking | `label-mono` | Títulos de sección y de tarjeta |

## Forma, espacio e iconos (dirección «Creador», 2026-11-25)
- Radio base `--radius: 0.875rem` (14 px). Tarjetas `rounded-xl` (≈ 20 px), diálogos y hojas `rounded-2xl`/`rounded-3xl`,
  campos `rounded-lg`. **Botones, chips, pestañas y badges en píldora** (`rounded-full`).
- Botones: por defecto 40 px; la acción principal de cada pantalla en `size="lg"` (48 px). En táctil, todo control ≥ 44 px.
- Tarjetas con más aire (24 px de relleno desde `sm`). Utilidad `lift`: se elevan 2 px al pasar el ratón (sin movimiento con «reducir movimiento»).
- Iconos: **Lucide**, trazo 1.75 px, **con fondo suave** (`<IconBubble tone=…>`: neutro, lima, ámbar, info, éxito, aviso, error).
  Navegación con iconos grandes (32 px de burbuja); el elemento activo lleva la burbuja en lima.
- Estados vacíos ilustrados: `<EmptyState icon=…>` (icono grande con fondo suave, una frase y la acción que lo resuelve).
- Animaciones sutiles: `animate-rise` (entrada de página, **fill `backwards`**, nunca `both`: rompería los `position: fixed`),
  `animate-pop` (menús y hojas). Todas se anulan con `prefers-reduced-motion`.
- Espaciado en múltiplos de 4 px. Gráficas con rejilla discontinua.

### Proyectos
- Cada proyecto tiene color y avatar (iniciales) **derivados del id** (`src/lib/projects/identity.ts`, sin columna en la BD),
  con los colores de las series de gráficas. `<ProjectAvatar>` y `<ProjectDot id>`: siempre junto al nombre (decorativos).
- Selector de proyectos arriba de la barra lateral (y en la cabecera en móvil, como hoja inferior): buscar, recientes y todos,
  con punto de estado (ámbar = algo por aprobar o sin leer). Atajos: **Alt + 1…9** y **G, P**; en Ctrl/Cmd + K, «Cambiar a X».
  Al cambiar se mantiene la sección (del Calendario de A al Calendario de B).
- Cookie de preferencia `kreo_recent_projects` (ids de los últimos proyectos, 1 año, solo interfaz).

### Publicaciones como miniaturas
- `<PostThumb>`: imagen, póster (miniatura de YouTube) o primer fotograma del vídeo (`<video preload="metadata">`, URL firmada).
- `<PostCard>`: tarjeta vertical 9:16 con estado (chip de fondo sólido), logo de la red y «Generado con IA» si aplica.
- `<UpcomingStrip>`: tira «Próximas publicaciones» (carrusel) en el Inicio y en el panel del proyecto.
- Las URL se firman **por lotes** (`getPostCovers` en `src/lib/server/post-media.ts`: una consulta de assets y un `createSignedUrls`).

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

## Uso de la lima (desde 2026-11-19)
La lima solo significa tres cosas:
1. **Acción principal** (botón por defecto, un solo botón lima por pantalla).
2. **Lo seleccionado o actual** (pestaña, filtro, tarjeta elegida, día de hoy, sección activa).
3. **El cursor de Kreo** (`kreo_`): el bloque que cierra el logo es también el indicador de "Kreo está trabajando"
   (`<TerminalCursor />`, en todos los estados de carga y botones pendientes).

Todo lo demás es neutro: enlaces de texto (`link`: color del texto + subrayado), iconos decorativos (`text-muted-foreground`),
barras de progreso y datos (`bg-foreground/70`), insignias por defecto (neutras). Confirmaciones y "listo" usan `success`.

## Navegación
- **Escritorio**: barra lateral con selector de proyecto, botón **Crear** (relleno de texto, no lima: la lima queda para la acción
  principal de la pantalla) y búsqueda. Día a día arriba con iconos grandes: Inicio · Resumen · Calendario (por aprobar) ·
  Bandeja (sin leer) · Estudio · Clipper · Mi agenda. El resto en «Más» (plegable). Migas «[avatar] Proyecto › Sección» arriba del contenido.
- **Crear** abre: Publicación, Generar con IA, Clips de un vídeo, Bloque en mi agenda, Desde plantilla (+ Nuevo proyecto),
  siempre en el proyecto actual (el de la URL o el último usado), que se indica en el menú.
- **Móvil**: cabecera con el proyecto actual (abre el selector en hoja inferior), buscar y avisos. Barra inferior:
  Inicio · Calendario · **Crear** (botón central flotante) · Bandeja · Más. «Más» abre el menú completo.
  Respeta las zonas seguras del iPhone (`viewport-fit=cover` + `env(safe-area-inset-*)`).
