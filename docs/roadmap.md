# Roadmap

> Regla nº 1 (sección 0 del brief): todo 100 % legal, solo APIs oficiales, nada de automatizar engagement,
> aprobación humana antes de publicar/enviar contenido generado por IA. El subagente `seguridad-legal`
> revisa cada módulo y deja nota en `/docs/compliance.md` antes de darlo por terminado.

## Fase 0 · Nombre e identidad visual ← EN CURSO
- [x] 10 propuestas de nombre (ver resumen en el chat / `docs/brand.md` cuando se cierre)
- [x] 3 direcciones visuales renderizadas en `/brand-preview`
- [ ] Oier elige nombre + dirección
- [ ] Oier comprueba dominio (.com/.io) y marca (EUIPO / OEPM, clases 9, 35, 42)
- [ ] Design system: tokens CSS + Tailwind, modo claro/oscuro, shadcn/ui personalizado, logo SVG, favicon
- [ ] `docs/brand.md`

## Fase 1 · MVP
- Auth (Supabase, email + Google, 2FA opcional), workspaces, proyectos, brand kit
- Vincular cuentas por OAuth oficial (TikTok, Instagram, YouTube) con estado de conexión y reconectar
- Programar publicaciones + calendario (mes/semana/lista), estados, límites anti-baneo, etiqueta IA
- Stats propias básicas
- Generación de imagen (capa de proveedores) + créditos básicos (saldo + ledger atómico)
- Páginas legales, banner de cookies, landing + lista de espera con doble opt-in
- i18n es/en, RLS en todas las tablas, tokens cifrados, export/borrado de cuenta

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
| Email transaccional | Proveedor con región UE (a decidir: Resend / Postmark / Brevo) | Doble opt-in, bajas |
