# Registro de cumplimiento

Mantenido por el subagente `seguridad-legal`. Cada módulo añade una entrada **antes** de darse por terminado.

> ⚖️ Recordatorio: un abogado debe revisar todos los textos legales (privacidad, términos, cookies, aviso legal,
> términos de afiliados) antes del lanzamiento público.

## Plantilla por módulo
```
## <Módulo> — <fecha> — Estado: ✅ aprobado / ⚠️ con condiciones / ⛔ vetado
- APIs usadas:
- Permisos / scopes (y justificación):
- Datos guardados (qué, dónde, cuánto tiempo):
- Riesgos:
- Mitigaciones:
- Pendiente:
```

---

## Fase 0 · Brand preview — 2026-11-18 — Estado: ✅ aprobado
- APIs usadas: ninguna.
- Permisos: ninguno.
- Datos guardados: ninguno. Sin cookies; sin analítica. Página con `noindex`.
- Fuentes: Google Fonts (Space Grotesk, JetBrains Mono, Bricolage Grotesque, DM Sans, DM Mono, Sora, Inter),
  todas con licencia SIL OFL (uso comercial permitido). Se sirven auto-alojadas vía `next/font`
  (no se envían peticiones del navegador a Google → sin transferencia de IP a terceros).
- Iconos: Lucide (licencia ISC).
- Riesgos: el nombre elegido puede chocar con marcas registradas.
- Mitigaciones: comprobar EUIPO (eSearch plus), OEPM y TMview en clases 9, 35 y 42 + dominio antes de
  invertir en marca. Considerar consulta a un agente de propiedad industrial antes de registrar.

## Fase 0 · Design system e infraestructura — 2026-11-18 — Estado: ✅ aprobado
- APIs usadas: ninguna en la app. Infraestructura creada: Vercel (proyecto `kreo`, funciones en `fra1`) y
  Supabase (proyecto `kreo`, región `eu-central-1`). Todavía no hay tablas ni datos personales.
- Variables públicas en Vercel: URL de Supabase y clave *publishable* (diseñada para estar en el navegador;
  la protección real será RLS en todas las tablas). La `service_role`/secret key NO está en Vercel ni en el repo:
  se añadirá como variable *sensitive* solo cuando la necesite el backend.
- Datos guardados: ninguno. `next-themes` guarda la preferencia claro/oscuro en `localStorage`
  (estrictamente necesaria para una función pedida por el usuario → exenta de consentimiento, LSSI art. 22.2).
  Hay que mencionarla en la política de cookies.
- Fuentes Space Grotesk y JetBrains Mono (SIL OFL), auto-alojadas. Iconos Lucide (ISC). Componentes shadcn/ui y Radix (MIT).
- Logo: wordmark derivado de Space Grotesk (la OFL permite usar la fuente en un logo; el logo no es una redistribución de la fuente).
- Subencargados nuevos: Vercel Inc. y Supabase Inc. → añadir a la lista de subencargados y firmar sus DPA
  (ambos ofrecen DPA con cláusulas contractuales tipo para transferencias internacionales).
- Riesgos: conflicto de marca "Kreo"; despliegues de vercel.app accesibles con enlace.
- Mitigaciones: comprobación EUIPO/OEPM pendiente; Vercel Authentication activa en las URLs de Vercel; `noindex` global.

## Fase 1 · Auth, workspaces, proyectos, brand kit y créditos — 2026-11-18 — Estado: ⚠️ aprobado con condiciones
- APIs usadas: Supabase Auth (email + contraseña) y Postgres/Storage de Supabase (UE, Frankfurt). Ninguna red social todavía.
- Datos guardados:
  - `auth.users` (Supabase): email, hash de contraseña, metadatos de registro (nombre, idioma, fecha de aceptación de términos).
  - `profiles`: nombre, idioma, avatar (vacío), `marketing_opt_in` (siempre false hasta tener doble opt-in).
  - Workspaces, miembros con rol, proyectos, brand kits (texto de marca, colores, fuentes, enlaces a posts de ejemplo; **sin descargar contenido de terceros**).
  - Créditos: saldo + ledger inmutable. Registro de actividad sin datos personales en `metadata`.
- Cookies: sesión de Supabase (`sb-*`, estrictamente necesaria), `NEXT_LOCALE` (idioma elegido) y `kreo_ws` (workspace activo, httpOnly). Todas técnicas → exentas de consentimiento (LSSI 22.2); a listar en la política de cookies.
- Seguridad verificada:
  - RLS en todas las tablas; prueba con un usuario ajeno: 0 filas visibles y 0 actualizaciones posibles.
  - Escrituras sensibles solo vía funciones `SECURITY DEFINER` con `search_path` vacío y comprobación de rol.
  - Créditos: cobro atómico (bloqueo de fila), idempotente por clave; `grant_credits` solo para el servidor (el usuario recibe "permission denied").
  - `plan_id` del workspace no lo puede cambiar el usuario (solo el servidor/Stripe).
  - Validación con zod en todas las acciones; redirecciones internas solo hacia `/app` (sin open redirect); errores traducidos sin filtrar mensajes internos.
  - Bucket `brand-assets` privado, por workspace, sin SVG (evita scripts embebidos), máx. 5 MB.
- Riesgos / condiciones pendientes antes del lanzamiento:
  1. **Email transaccional propio (SMTP)**: el de Supabase solo es para pruebas. Necesario para confirmación de cuenta y recuperación de contraseña.
  2. **Recuperar contraseña, exportar datos y borrar cuenta** (derechos RGPD): pendientes en esta fase.
  3. **2FA (TOTP)** opcional: pendiente en esta fase.
  4. Textos legales: páginas creadas como borrador vacío; hay que redactarlas y que las revise un abogado.
  5. El checkbox de marketing se eliminó del registro hasta implementar doble opt-in.
  6. La aceptación de términos se guarda en los metadatos de registro; conviene versionar los términos aceptados.
