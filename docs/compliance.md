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
- Fuentes Sora, Inter y JetBrains Mono (SIL OFL), auto-alojadas. Iconos Lucide (ISC). Componentes shadcn/ui y Radix (MIT).
- Logo: wordmark derivado de Sora (la OFL permite usar la fuente en un logo; el logo no es una redistribución de la fuente).
- Subencargados nuevos: Vercel Inc. y Supabase Inc. → añadir a la lista de subencargados y firmar sus DPA
  (ambos ofrecen DPA con cláusulas contractuales tipo para transferencias internacionales).
- Riesgos: conflicto de marca "Kreo"; despliegues de vercel.app accesibles con enlace.
- Mitigaciones: comprobación EUIPO/OEPM pendiente; Vercel Authentication activa en las URLs de Vercel; `noindex` global.
