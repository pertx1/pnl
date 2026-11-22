# Microsoft · Outlook (Microsoft Graph) y Publisher verification

> Verificado el **2026-11-22**. Registro multitenant + cuentas personales (`/common`), permisos delegados `openid`,
> `email`, `offline_access`, `Mail.Read`, `Mail.Send`. Redirect URI: `https://<DOMINIO>/api/inbox/oauth/outlook/callback`.

## 0. ¿Hace falta revisión?

- **No hay App Review** en Microsoft para estos permisos: `Mail.Read` y `Mail.Send` delegados admiten consentimiento del
  usuario por defecto, pero **cada tenant de empresa puede exigir consentimiento de administrador** por política.
- **Publisher verification** no es obligatoria, pero sin ella: el consentimiento muestra "unverified", y "if risk-based
  step-up consent is enabled, users can't consent to most newly registered multitenant apps that aren't publisher
  verified" (apps registradas después del 08-11-2020 que piden más que el inicio de sesión básico). Muchos tenants de
  empresa además solo permiten consentir apps de editores verificados. **Conviene hacerla antes de abrir Outlook a
  empresas y agencias.** Para cuentas personales (outlook.com/hotmail) funciona sin ella, con aviso.
- Coste: "Microsoft doesn't charge developers for publisher verification". Si se cumplen los requisitos, se hace "in minutes".

## 1. Requisitos (bloqueantes para la verificación)

- [ ] **Cuenta de Microsoft AI Cloud Partner Program (CPP)** verificada (cuenta global PGA, no una "location"). La
  verificación de Partner Center comprueba:
  - **Email**: "Use only an employee business email address… not a personal or free email account" → necesita
    `oier@<DOMINIO>` o similar (email corporativo 💶).
  - **Identidad**: documento oficial de la persona.
  - **Empleo**: documentos del **dominio** "from an authorized registrar" con nombre de la empresa, dirección, dominios y
    fechas → el dominio debe estar registrado **a nombre de la entidad**.
  - **Negocio**: "Confirms your business is legally registered with the appropriate authority" → **requiere autónomo o
    sociedad** (B3 del README). Plazo: "three to five business days" en la mayoría de casos.
- [ ] App registrada en un **tenant de Microsoft Entra con cuenta de trabajo** ("Apps that are registered by using a
  Microsoft account can't be publisher verified"). Si se registró con una cuenta personal, crear un tenant (gratuito) y
  **registrar de nuevo** la app (nuevo client ID → actualizar `MICROSOFT_CLIENT_ID`/`SECRET`).
- [ ] Tenant asociado a la PGA de Partner Center.
- [ ] **Publisher domain** = `<DOMINIO>` verificado por DNS en Entra (no `*.onmicrosoft.com`), y coincidente con el dominio
  del email verificado en Partner Center.
- [ ] Usuario que verifica: *Application Administrator* o *Cloud Application Administrator* en Entra **y** *CPP Partner
  Admin* o *Account Admin* en Partner Center, con **MFA obligatoria** en la sesión.
- [ ] Aceptar los *Microsoft identity platform for developers Terms of Use*.

## 2. Pasos

1. Comprar dominio y email corporativo (README B1). Registrar el dominio a nombre de la entidad.
2. Crear tenant de Entra con cuenta de trabajo; añadir `<DOMINIO>` como dominio personalizado (registro TXT).
3. Registrar la app (si hace falta de nuevo): *Accounts in any organizational directory and personal Microsoft accounts*;
   redirect URI web; secreto; permisos delegados de Graph: `Mail.Read`, `Mail.Send`, `offline_access`, `openid`, `email`.
4. **Branding & properties**: nombre "Kreo", logo, Home page `https://<DOMINIO>/`, Terms `https://<DOMINIO>/legal/terminos`,
   Privacy `https://<DOMINIO>/legal/privacidad`, Publisher domain `<DOMINIO>`.
5. Darse de alta en el CPP (<https://partner.microsoft.com/dashboard/account/v3/enrollment/joinnow/basicpartnernetwork/new>)
   con el email corporativo y completar la verificación.
6. Entra → App registrations → Kreo → Branding & properties → **Add MPN ID / Partner One ID** (el de tipo PartnerGlobal) →
   Verify and save. Comprobar el distintivo azul en el consentimiento.

## 3. Textos (en inglés) para el consentimiento, la ficha de la app y los administradores de TI

No hay formulario de revisión, pero estos textos sirven para la descripción de la app, la página de ayuda para admins y
las preguntas de clientes empresa.

### Descripción
```
Kreo is a web app for content creators, small brands and agencies. Its Inbox lets a user read recent email
conversations from their own mailbox and reply to them, alongside Instagram Direct messages. AI can draft a reply
suggestion, but an email is only sent when the user clicks "Send". Kreo never sends bulk or unsolicited email and
does not modify the mailbox.
```

### Justificación de permisos delegados
```
openid, email: identify which mailbox was connected (email claim of the ID token) to show it in Kreo. Kreo does
not call /me or read other profile data.
offline_access: obtain a refresh token so the Inbox can sync recent messages without asking the user to sign in
again every hour. Tokens are encrypted at rest (AES-256-GCM) and deleted when the user disconnects.
Mail.Read: read messages from the Inbox and Sent Items folders from the last 30 days (GET
/me/mailFolders/{inbox|sentitems}/messages) to show conversations as plain text. Attachments are not downloaded.
Message content is deleted from Kreo after 30 days. Mail.ReadBasic is not enough because it excludes the message
body, which is needed to show and answer the conversation.
Mail.Send: send a reply in an existing conversation after the user clicks "Send" (POST /me/messages/{id}/reply,
saved in Sent Items). The recipient is fixed to the original sender, no CC/BCC, max 30 replies per hour, no
scheduled or automatic sending. Kreo does not request Mail.ReadWrite: it never moves, flags or deletes mail.
```

### Nota para administradores
```
Kreo requests delegated permissions only (no application permissions), acting on behalf of the signed-in user and
only on that user's own mailbox. To remove access: the user can go to account.microsoft.com > Privacy > Apps and
services, or a Microsoft 365 admin can remove the "Kreo" enterprise application. Disconnecting in Kreo deletes all
synced threads, messages and drafts.
```

## 4. Guion de vídeo (opcional: para admins de TI, soporte o Microsoft 365 App Compliance)

| # | Pantalla / acción | Rótulo (EN) |
|---|---|---|
| 1 | Kreo → Inbox → "Connect Outlook" | "The user chooses to connect their mailbox" |
| 2 | Consentimiento de Microsoft: nombre "Kreo", **distintivo de editor verificado**, lista de permisos | "Delegated permissions: Mail.Read, Mail.Send, offline_access" |
| 3 | Lista de conversaciones de los últimos 30 días; abrir una | "Mail.Read: recent conversations shown as plain text" |
| 4 | "Suggest reply" → borrador IA → editar → "Send" | "Sent only when the user clicks Send (Mail.Send)" |
| 5 | Outlook web: la respuesta en Enviados y en el hilo | "Reply saved in Sent Items" |
| 6 | Disconnect → texto con dónde retirar el permiso en Microsoft | "Data deleted from Kreo; how to revoke at Microsoft" |

## 5. Lista de comprobación: lo que suele fallar

- [ ] App registrada con cuenta personal (MSA) → `MSANotSupported`.
- [ ] Email de Partner Center en un dominio gratuito o distinto del publisher domain → `PublisherDomainMismatch`.
- [ ] Partner One ID de tipo *location* en vez de *PartnerGlobal* → `MPNGlobalAccountNotFound`.
- [ ] Cuenta CPP sin terminar de verificar → `MPNAccountNotVetted`.
- [ ] Usuario sin MFA en la sesión → `InteractionRequired`.
- [ ] Documentos del dominio o del negocio que no coinciden exactamente con el nombre legal.
- [ ] Pedir más permisos de los necesarios (`Mail.ReadWrite`, `User.Read.All`…): los admins lo bloquean.

Fuentes: [Publisher verification overview](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview) ·
[Troubleshoot publisher verification](https://learn.microsoft.com/en-us/entra/identity-platform/troubleshoot-publisher-verification) ·
[Partner Center verification](https://learn.microsoft.com/en-us/partner-center/verification-responses) ·
[Configure publisher domain](https://learn.microsoft.com/en-us/entra/identity-platform/howto-configure-publisher-domain) ·
[Auth code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
