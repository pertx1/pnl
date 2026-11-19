## Fase 4 · Equipo, planes/suscripción y afiliados (5.15, 5.16, 5.19) — 2026-11-19 — Estado: ⚠️ con condiciones (pendiente de revisión por `seguridad-legal`)

- **APIs usadas:**
  - Stripe (API oficial): Checkout `mode=subscription`, Billing Portal, Subscriptions, Invoices, InvoicePayments; webhook firmado.
  - Resend (vía `sendEmail`) para el email transaccional de invitación.
  - Ninguna API de redes sociales. Nada de scraping ni automatización de engagement.
- **Permisos / scopes (y justificación):**
  - Invitar, cambiar roles, quitar miembros, ver actividad e invitaciones: **admin+**. Transferir propiedad: **owner**.
    Nunca se puede dejar un workspace sin owner (`last_owner`, `transfer_ownership_required`).
  - Plan / suscripción / portal de facturación: **admin+** (como la compra de créditos).
  - `workspaces.plan_id` solo lo cambia `service_role` (webhook) → trigger `workspace_plan_guard` existente.
  - Funciones de sistema (`apply_subscription_state`, `record_commission`, `void_commission`, `mark_commission_paid`,
    `record_affiliate_click`, `attribute_referral`, `invitation_preview`) solo `service_role`.
  - Todas las funciones `security definer set search_path = ''`, `revoke ... from public, anon`. 2FA: `has_workspace_role`
    ya exige aal2; las funciones sin workspace (`accept_invitation`, `leave_workspace`, `join_affiliate_program`,
    `claim_referral`, `my_affiliate_stats`) comprueban `mfa_satisfied()`; todas las tablas nuevas llevan la política
    restrictiva `mfa_required`.
- **Datos guardados (qué, dónde, cuánto tiempo):**
  - `workspace_invitations`: email invitado, rol, quién invitó, **hash SHA-256** del token (nunca en claro), caducidad 7 días.
    Se borran 30 días después de aceptarse/revocarse/caducar (Inngest `team-purge-old-invitations`). Lectura: admin+.
  - `workspace_subscriptions`: IDs de cliente/suscripción del proveedor, plan, estado, fin de periodo, quién contrató.
    Sin datos de tarjeta (los gestiona Stripe). Lectura: admin+. Se borra con el workspace (cascade).
  - `affiliates`: código, estado y **fecha de aceptación de los términos** del programa (prueba del consentimiento).
  - `affiliate_click_stats`: **contador agregado por día** (sin IP, user agent, cookies ni ningún dato personal).
  - `referrals`: vínculo afiliado ↔ usuario referido + origen (`cookie` | `declared` | `signup`). **Sin políticas RLS**:
    el afiliado nunca ve quién es cada referido, solo agregados (`my_affiliate_stats`).
  - `affiliate_commissions`: factura (ID opaco del proveedor), importe neto, %, comisión y estado. El afiliado ve las suyas.
    Conservación: obligaciones contables/fiscales (6 años, art. 30 CCom) → pendiente de política de retención.
  - Registro de actividad: se escriben `member.*`, `ownership.transferred`, `invitation.revoked`, `plan.changed`
    (metadata sin datos personales: solo roles o planes). El email invitado NO va al log.
  - `team_members()` solo devuelve emails a admins (y el propio); el resto ve nombres.
- **Riesgos:**
  1. Cookie de atribución de afiliado = cookie no esencial (LSSI art. 22.2).
  2. Comisiones a afiliados → obligaciones fiscales (facturas, IVA/IRPF) y de publicidad (publicidad encubierta).
  3. Suscripción a consumidores: derecho de desistimiento de 14 días en servicios digitales.
  4. Autorreferidos / fraude de clics.
  5. Invitaciones como vector de spam o de acceso indebido.
  6. Restricción por proyecto: cambiar las políticas RLS de `projects/posts/...` (de varios módulos) podría romper accesos.
- **Mitigaciones:**
  1. `/r/<código>` fija `kreo_ref` **solo** si la cookie `kreo_consent` tiene `marketing: true` (parseada en servidor) y
     la vuelve a comprobar al usarla; sin consentimiento se usa `?ref=` (referido declarado) o el formulario
     «¿Te recomendó alguien?», sin cookie. Ventana de atribución de 30 días (provisional, también en SQL).
  2. El alta como afiliado exige aceptar `/legal/afiliados` (fecha guardada). El panel recuerda indicar #ad / colaboración
     pagada, prohíbe spam y pujas de marca. Pagos manuales tras 30 días de garantía; reembolsos y contracargos anulan la
     comisión pendiente (`charge.refunded`, `charge.dispute.created`).
  3. Checkbox antes de contratar: términos + renovación automática + inicio inmediato con pago proporcional si desiste.
     Cancelación en cualquier momento desde el portal de Stripe. IVA incluido; Stripe Tax si `STRIPE_TAX_ENABLED=true`.
  4. Sin comisión si el afiliado es miembro del workspace que paga o si se refiere a sí mismo; una sola atribución por
     usuario; prefetch/preview no cuenta como clic. Comisión limitada a N meses (env, por defecto 12).
  5. Invitación ligada al email (debe coincidir con la cuenta que acepta), caduca en 7 días, máx. 30 invitaciones/24 h por
     workspace, cuenta como plaza del plan. Email transaccional (lo pide un admin), sin contenido comercial.
  6. **Restricción por proyecto pospuesta («Próximamente»)**: no se ha tocado ninguna política existente.
- **Pendiente:**
  - Revisión del subagente `seguridad-legal` y `qa-tester` (Vitest + Playwright) antes del merge.
  - **Migración `20261120130000_team.sql` NO aplicada** (la herramienta pidió confirmación y no hubo respuesta). Se validó
    completa con `execute_sql` dentro de una transacción revertida (flujos de invitación, límites, roles, propiedad,
    suscripción, créditos idempotentes, comisiones, grants). Aplicar y pasar `get_advisors`.
  - El formulario de registro (`src/app/(auth)`, fuera de este módulo) debe enviar `ref` en `options.data` para que el
    trigger `handle_new_user_referral` atribuya el alta; y el onboarding podría ofrecer «tienes una invitación pendiente».
  - Oier: precios y límites definitivos (`src/lib/billing/plans.ts` + nueva migración de `plans`), % y duración de comisión,
    términos de afiliados con abogado, régimen fiscal de pagos a afiliados, posible cambio a Paddle (MoR).
  - Stripe: crear productos/precios (lookup_key `kreo_pro_monthly`, `kreo_agency_monthly`) y configurar el Customer Portal
    (cambio de plan, cancelación al final del periodo, facturas).
  - Añadir `workspace_invitations`, `workspace_subscriptions` y datos de afiliados al RoPA (`docs/ropa.md`) y Stripe/Resend
    ya están en subencargados.
