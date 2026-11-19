# Roadmap

> Regla nº 1 (sección 0 del brief): todo 100 % legal, solo APIs oficiales, nada de automatizar engagement,
> aprobación humana antes de publicar/enviar contenido generado por IA. El subagente `seguridad-legal`
> revisa cada módulo y deja nota en `/docs/compliance.md` antes de darlo por terminado.

## Fase 0 · Nombre e identidad visual ✅ (pendiente solo la comprobación de marca/dominio)
- [x] 10 propuestas de nombre
- [x] 3 direcciones visuales renderizadas en `/brand-preview`
- [x] Elegido: **Kreo** + dirección **A · Terminal de crecimiento**
- [ ] Oier comprueba dominio (.com/.io/.app) y marca (EUIPO / OEPM / TMview, clases 9, 35, 42)
- [x] Design system: tokens CSS + Tailwind, modo claro/oscuro, shadcn/ui personalizado, logo SVG, favicon (`/design-system`)
- [x] `docs/brand.md`

## Infraestructura
- GitHub `pertx1/pnl`: `main` = producción.
- Vercel: proyecto `kreo` (funciones en `fra1`), despliegue automático en cada push a `main`; previews por rama.
  Protegido con Vercel Authentication hasta el lanzamiento. ⚠️ El plan Hobby no permite uso comercial:
  antes de cobrar a usuarios hay que pasar a Pro (≈20 $/mes por miembro).
- Supabase: proyecto `kreo` en `eu-central-1` (Frankfurt), plan gratuito de la organización "NFC".
  ⚠️ El plan gratuito pausa proyectos inactivos y no tiene backups diarios: pasar a Pro antes del lanzamiento.

## Fase 1 · MVP ← EN CURSO (código hecho; falta activar con claves y revisiones de las plataformas)
- [x] Esquema base con RLS + 2FA exigido también en base de datos
- [x] Auth email + contraseña, recuperar contraseña, 2FA (TOTP), proxy de sesión, i18n es/en
- [x] Ajustes: perfil, contraseña, 2FA, exportar datos (JSON), borrar cuenta (con revocación de tokens)
- [x] Onboarding, proyectos con límite de plan, brand kit con logo
- [x] Cuentas sociales por OAuth oficial (TikTok, Instagram, YouTube), tokens cifrados AES-256-GCM, estado y reconexión
- [x] Publicaciones: editor con reglas por red (UX obligatoria de TikTok), aprobación humana, límites diarios anti-baneo, aviso de texto duplicado
- [x] Calendario mes/semana/lista arrastrable, por proyecto y global
- [x] Worker Inngest: publicación programada (cola por cuenta, reintentos limitados, etiqueta IA nativa), métricas cada 6 h, plazos de borrado
- [x] Analíticas propias con gráfica, comparativa y CSV
- [x] Estudio de IA de imagen (fal.ai, FLUX schnell) y Guionista con Claude, con créditos atómicos y reembolso si falla
- [x] Landing + blog + lista de espera con doble opt-in y referidos; banner de cookies; textos legales en borrador
- [ ] **Pendiente de Oier**: claves (ver `.env.example`), apps de desarrollador y sus revisiones, proveedor de email, abogado
- [ ] Mejores horas para publicar (necesita datos reales), Google login, versión de términos aceptados
- [ ] Tests e2e en CI

## Fase 2
- Análisis de competencia (YouTube Data API, IG Business Discovery, TikTok vía proveedor externo con aviso de datos estimados)
- Buscador de productos (Meta Ad Library API)
- Biblioteca de hooks e inspiración (solo enlaces + notas)
- Estrategia y roadmap por cuenta (agente Estratega)
- Calentamiento guiado (checklist manual, nunca automatizado)

## Fase 3
- Bandeja unificada (IG Messaging con ventana 24 h, Gmail, Outlook) con aprobación de respuestas
- Vídeo / voz / música IA, Clipper
- Servidor MCP

## Fase 4
- Planes Stripe completos + Stripe Tax + portal de cliente
- Equipo y roles con flujo de aprobación y registro de actividad
- Informes PDF marca blanca
- Afiliados
- Shopify

## Decisiones técnicas (propuestas, se confirman al empezar la Fase 1)
| Tema | Propuesta | Por qué |
|---|---|---|
| Framework | Next.js 16 (App Router) + TS + Tailwind 4 + shadcn/ui | Pedido en el brief; versión estable actual |
| BD / Auth | Supabase región UE (Frankfurt) | RGPD, RLS nativo |
| Colas | **Inngest** | `throttle`/`concurrency` por clave (p. ej. por cuenta social) → respeta rate limits sin código propio; cron, reintentos con backoff y pasos durables; se ejecuta sobre nuestras rutas de Vercel. Los eventos llevarán solo IDs (sin datos personales). El procesado pesado de vídeo (Clipper, Fase 3) irá a un worker aparte. |
| Pagos | Stripe Billing + Stripe Tax | IVA UE (OSS) gestionado |
| Hosting | Vercel (funciones en región `fra1`) | Pedido en el brief; cercanía a Supabase UE |
| Cache Components (Next 16) | Desactivado | La app es casi toda por usuario; evita envolver cada lectura de sesión en `<Suspense>`. Reactivable. |
| i18n | next-intl sin prefijo en la URL (cookie → Accept-Language → es) | Sencillo para la app; la landing podrá usar rutas `/en` por SEO |
| Acceso a datos | DAL en `src/lib/server/dal.ts` con la sesión del usuario (RLS) | Nunca service key para datos de usuario |
| Email transaccional | Resend vía API (adaptador intercambiable en `src/lib/email`) — **a confirmar por Oier** | Doble opt-in, baja en un clic (List-Unsubscribe) |
| IA texto | Claude Opus 5.5 con salidas estructuradas y respaldo automático ante rechazos | Agentes en `src/lib/agents`, prompts versionados |
| IA imagen | fal.ai · FLUX.1 [schnell] (Apache 2.0, uso comercial) | FLUX dev NO: licencia no comercial |
