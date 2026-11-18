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
