# Convenciones de desarrollo de Kreo (léelo antes de tocar código)

Stack: Next.js 16 (App Router, `src/proxy.ts` en vez de middleware, Cache Components DESACTIVADO) · TypeScript · Tailwind 4 ·
shadcn/ui (estilo radix-nova, en `src/components/ui`) · next-intl (sin prefijo de idioma) · Supabase (UE) · Inngest · zod v4.
Lee `CLAUDE.md` (regla nº 1: 100 % legal y sin baneos) y `docs/brand.md`.

## Estructura
- Páginas privadas: `src/app/app/(shell)/...` (con barra lateral). Las de un proyecto: `src/app/app/(shell)/p/[projectId]/<módulo>/`.
- Acciones de servidor: `actions.ts` junto a la página (`"use server"`; SOLO exportar funciones async). Validar todo con zod.
- Lecturas con la sesión del usuario → RLS: `createClient()` de `@/lib/supabase/server`. DAL en `@/lib/server/dal.ts`
  (`getProject(projectId)` devuelve el proyecto + `workspace.role`, y hace 404 si no hay acceso; `roleAtLeast(role, "editor")`).
- Cliente con clave secreta (salta RLS) `createAdminClient()` de `@/lib/supabase/admin`: SOLO para operaciones de sistema
  (webhooks, workers, guardar resultados de proveedores) y SIEMPRE después de comprobar permisos con la sesión del usuario.
  Puede devolver `null` si falta la clave → la UI debe mostrar "pendiente de configurar", nunca romper.
- Params de páginas: usa `{ params }: { params: Promise<{ projectId: string }> }` (no `PageProps<...>` en rutas nuevas).

## Base de datos
- Migración nueva en `supabase/migrations/<timestamp asignado>_<módulo>.sql`. RLS en TODAS las tablas.
  Toda tabla de datos de un proyecto lleva `workspace_id` (+ `project_id`) y políticas con `public.has_workspace_role(workspace_id, 'viewer'|'editor'|'admin')`.
  Añade también la política restrictiva de 2FA:
  `create policy "mfa_required" on public.<t> as restrictive for all to authenticated using ((select public.mfa_satisfied()));`
  Índices en claves foráneas. Funciones `security definer set search_path = ''` y `revoke execute ... from public, anon`.
  Trigger `public.enforce_project_workspace()` (ya existe) para comprobar que `workspace_id` coincide con el del proyecto.
- Proyecto Supabase: `qowvtzqqrmccuavqtsgr`. Si tienes la herramienta MCP de Supabase, aplica tu migración con `apply_migration`
  (y comprueba con `get_advisors`); si no, déjala en el archivo y dilo en tu informe.
- Tipos: añade tus tablas/funciones SOLO en `src/lib/supabase/types/<módulo>.ts` (mismo formato que `database.types.ts`:
  Row/Insert/Update/Relationships). Se combinan automáticamente.

## IA y créditos
- Toda acción con coste muestra el coste ANTES (`<CreditCost credits={n} />`) y cobra de forma atómica con la RPC
  `start_ai_generation` (ver `src/app/app/(shell)/p/[projectId]/posts/ai-actions.ts` → `withCharge`, y `studio/actions.ts`).
  Si falla tras cobrar: devolver con `grant_credits` (admin) y clave `refund:<id>`.
- Texto: agentes en `src/lib/agents/` con `runStructured({ system, user, schema })` (Claude Opus 5.5, salidas estructuradas zod).
  Prompts versionados (`export const X_VERSION = "nombre@fecha.n"`), brand kit vía `brandBlock()` y `COMMON_RULES`.
  Sin `ANTHROPIC_API_KEY` → `isAgentsConfigured()` es false → UI "pendiente de configurar".
- Imagen/vídeo: `src/lib/ai/catalog.ts` + `src/lib/ai/providers/fal.ts`.
- La IA PROPONE, el usuario APRUEBA. Nada se publica ni se envía sin un clic humano.

## Plataformas (regla nº 1)
- Solo APIs oficiales con OAuth oficial; nada de scraping con login ni APIs no oficiales; nada de automatizar engagement.
- Sin API oficial → la función queda como "Próximamente" o alternativa manual.
- Tokens OAuth: cifrados con `encryptToken` (`src/lib/crypto/tokens.ts`) en tablas sin políticas RLS (solo service role).
  Patrón de OAuth de referencia: `src/app/api/oauth/[platform]/*` y `src/lib/social/*`.
- fetch a plataformas con `platformFetch` (`src/lib/social/http.ts`): timeout, backoff, sin bucles.

## UI y diseño (design system v2 — ver docs/brand.md)
- Usa SIEMPRE tokens: `bg-background`, `bg-card`, `text-muted-foreground`, `border-border`, `text-primary-ink`, `bg-primary`.
  Utilidades: `surface` (borde fino + brillo), `label-mono` (eyebrow en mayúsculas), `display`, `bg-dots`, `animate-rise`.
- Bordes finos antes que sombras. UN acento (lima) solo en acción principal/activo/foco. Botones píldora (componente Button).
- Cabecera de página: `<p className="label-mono">{proyecto}</p>` + `<h1 className="text-[28px] leading-tight font-medium">`.
- Componentes Kreo: `StatusBadge`, `AiBadge`, `CreditCost`, `StatCard`, `PlatformIcon`, `AreaChart` (`src/components/...`).
- Estados vacíos cuidados (icono Lucide 1.5px + frase útil + acción). Responsive desde 360 px. Accesible (labels, foco, aria).
- Gráficas: una serie por gráfica salvo necesidad, `var(--chart-1..5)`, sin ejes dobles.

## i18n
- Todos los textos en `messages/modules/<tu módulo>/{es,en}.json` bajo una clave raíz propia (p. ej. `"competitors": {...}`).
  Mismas claves en ambos idiomas. No edites `messages/es.json`/`en.json` (salvo que se te indique).

## Tareas en segundo plano
- Inngest: añade tus funciones al array de `src/inngest/modules/<tu módulo>.ts` (cliente en `src/inngest/client.ts`).
  Eventos solo con IDs. Concurrencia/throttle por cuenta cuando llames a APIs externas.

## Verificación (no ejecutes `next build`: otros agentes trabajan a la vez)
- `npx tsc --noEmit` (ignora errores en `.next/` y en rutas `PageProps<...>` antiguas) y `npx eslint <tus archivos>`.
- Tests unitarios Vitest para tu lógica pura en `tests/unit/<módulo>.test.ts` (`npx vitest run tests/unit/<módulo>.test.ts`).
- No hagas commits. No toques archivos fuera de tu lista.
