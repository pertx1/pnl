# Estado de Kreo

_Última actualización: 2026-11-23_

## Qué es
SaaS todo-en-uno para creadores, dropshippers, marcas y agencias: crear con IA, programar y publicar en
TikTok / Instagram / YouTube **con aprobación humana**, bandeja unificada, investigación, estrategia, equipo y facturación.
Regla nº 1: 100 % legal y sin baneos (solo APIs oficiales). Marca: dirección A «Terminal de crecimiento» (`docs/brand.md`).

## Dónde está todo (sin secretos)

| Cosa | Dónde |
|---|---|
| App en producción | https://kreo-nine.vercel.app (el alias `kreo-mnysoon-1995.vercel.app` está protegido por Vercel: **no usar**) |
| Código | GitHub `pertx1/pnl` · `main` = producción (Vercel despliega solo) · rama de trabajo `claude/wizardly-carson-8y3exd` |
| Vercel | equipo `mnysoon-1995`, proyecto `kreo` · [variables](https://vercel.com/mnysoon-1995/kreo/settings/environment-variables) · [despliegues](https://vercel.com/mnysoon-1995/kreo/deployments) |
| Base de datos | Supabase, proyecto `qowvtzqqrmccuavqtsgr` (Frankfurt, plan Free) · [panel](https://supabase.com/dashboard/project/qowvtzqqrmccuavqtsgr) |
| Tareas programadas | Inngest (integración de Vercel, plan gratis) · [apps](https://app.inngest.com/env/production/apps) |
| Google (YouTube, Gmail) | Cloud project `kreo-515218`, consentimiento «En prueba» · [clientes](https://console.cloud.google.com/auth/clients?project=kreo-515218) · [usuarios de prueba](https://console.cloud.google.com/auth/audience?project=kreo-515218) |
| Meta (Instagram) | App `29288275864162154` (tipo Empresa, modo desarrollo), configuración de login `29290673200559330`, webhook de mensajes verificado |
| TikTok | App «Kreo App» `7709972032187926548`, entorno **Kreo Sandbox** (sin auditar → solo publicación privada) |
| Microsoft (Outlook) | Registro «Kreo», client ID `43ead4e7-7737-4d71-8c9a-c0f22745bdea` |
| IA | fal.ai (imagen/vídeo/transcripción), Anthropic (agentes de texto), ElevenLabs (voz/música, plan Creator) |
| Workspace de Oier | «Pertx», plan interno **Fundador** (límites prácticamente ilimitados) |

Variables de entorno: lista completa en `.env.example`; estado de cada una en Vercel (nunca copiar valores aquí).

## Qué funciona (comprobado)
- Registro, login, 2FA, ajustes, exportar/borrar cuenta, workspaces y proyectos.
- Estudio de IA: imágenes (FLUX 2 Flash comprobado en producción), con cobro de créditos y reembolso automático.
- Cuentas conectadas: **Instagram**, **TikTok** (sandbox) y **YouTube** (canal Akerra).
- Editor de publicaciones con reglas por red, aprobación y calendario; YouTube con miniatura, etiquetas, categoría y listas.
- Diseño v2, móvil con barra inferior, ordenador con ancho unificado, accesibilidad (HIG).

## Hecho pero SIN comprobar en real
- **Conector de Claude (MCP + OAuth)**: `https://kreo-nine.vercel.app/api/mcp`; pendiente de que Oier lo añada en claude.ai.
- **Publicación programada** → depende de Inngest, que aún **no llama a la app** (ver pendientes de Oier).
- Bandeja (DMs de Instagram, Gmail, Outlook), audio (ElevenLabs), Clipper, informes PDF, Shopify, MCP, equipo, planes, afiliados.

## Límites actuales
- TikTok publica en **privado** hasta pasar su auditoría.
- YouTube ya publica en **público** (cambio de YouTube del 2026-11-02); el token caduca cada 7 días mientras Google esté «En prueba».
- Instagram/Meta en modo desarrollo: funciona para las cuentas con rol en la app (la de Oier).
- Revisiones de apps bloqueadas por: dominio propio, textos legales sin rellenar ni revisar, y (Meta/Microsoft) empresa registrada. Detalle en `docs/app-review/README.md`.
