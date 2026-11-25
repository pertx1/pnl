# Pendientes de Oier

Lo que solo puedes hacer tú (consolas, pagos, decisiones). En orden. Tacha con `[x]` cuando esté hecho
(o dile a Claude «hecho lo de X» y lo tacha él).

## Ahora (para usar la app al 100 %)
- [x] **Añadir Kreo como conector en Claude**: claude.ai → Ajustes → Conectores → «Añadir conector personalizado» →
  URL `https://kreo-nine.vercel.app/api/mcp` → Conectar → iniciar sesión en Kreo → elegir workspace → Permitir.
- [x] ~~Conectar Inngest~~ — hecho por Claude el 2026-11-23 (sincronizado con un PUT a `/api/inngest`).
- [ ] **Reconectar YouTube** (Cuentas → desconectar y conectar) para dar el permiso de listas de reproducción.
- [x] Publicación real probada (Instagram + YouTube, 2026-11-23). TikTok: hay que poner la cuenta en privado mientras no esté auditada.
- [ ] **Conectar Gmail u Outlook** en la Bandeja (opcional).

## Instagram: mensajes y comentarios con Unified Login (2026-11-26)
> «Instagram API with Instagram Login» no está disponible en la app: se usa la configuración **1203482298883759** (ya en Vercel).
- [ ] Meta → *API setup with Unified login*: comprobar que la **Redirect URL** es `https://kreo-nine.vercel.app/api/inbox/oauth/instagram/callback`
  (y que está también en *Facebook Login for Business → Valid OAuth Redirect URIs*).
- [ ] Meta → configuración 1203482298883759 → *Edit permissions*: **quitar `ads_management`, `ads_read` e `instagram_content_publish`**
  (la Bandeja no los usa; dejarlos complica la revisión). Mantener `instagram_basic`, `instagram_manage_messages` e `instagram_manage_comments`.
  No hace falta añadir `pages_show_list` ni `pages_manage_metadata`.
- [ ] Meta → *Webhooks* → objeto **Instagram**: suscribir los campos `messages` y **`comments`** (mismo callback y verify token).
- [ ] Aplicar la migración `20261126110000_inbox_comments.sql` (o decirle a Claude que la aplique) antes de desplegar la rama.
- [ ] En la Bandeja (proyecto Akerra): **Reconectar** Instagram, entrar con `akerra.nortasuna`, elegir el portfolio «Akerra» y la
  cuenta, aceptar todo y activar «Permitir acceso a los mensajes» en Instagram si lo pide.
- [ ] No poner `INSTAGRAM_APP_ID` en Vercel: si se pone, la Bandeja vuelve a Instagram Login (que la app no tiene).
- [ ] Decidir si se piden `gmail.modify` / `Mail.ReadWrite` para que «marcar como leído» se refleje también en Gmail/Outlook
  (recomendación: **no** por ahora; ver decisiones).

## Limpieza de consolas (5 min)
- [ ] Google: añadir el scope `youtube.force-ssl` en [Data access](https://console.cloud.google.com/auth/scopes?project=kreo-515218) y quitar `yt-analytics.readonly`.
- [ ] Google: inhabilitar el secreto viejo del cliente «Kreo web» (el que termina en …MyfB).
- [ ] TikTok (Kreo Sandbox → Scopes): **marcar `video.upload`** (ahora sí se usa: «Enviar a mis borradores de TikTok») y **desmarcar `video.list`**. Después **reconectar TikTok** en Cuentas.
- [x] Migración de borradores de TikTok aplicada y desplegada (2026-11-24). `TIKTOK_DIRECT_POST_AUDITED` sin poner en Vercel (= borradores).
- [ ] Meta: en la configuración de login `29290673200559330`, quitar `instagram_manage_insights`.
- [ ] Supabase: borrar la clave secreta antigua que no funcionaba (dejar solo `kreo_vercel`) en [API keys](https://supabase.com/dashboard/project/qowvtzqqrmccuavqtsgr/settings/api-keys).
- [ ] Supabase: aceptar la confirmación cuando Claude borre la cuenta de prueba `qa@kreo-qa.invalid`.

## Clipper v2
- [x] Migración del Clipper v2 aplicada (2026-11-24).
- [ ] Decidir el **reencuadre que sigue a la persona**: fal no tiene recorte con desplazamiento. Opciones: FFmpeg propio en un worker
  (coste de CPU en Vercel/otro servidor), una app propia en fal (pago por segundo) o Replicate. Hasta entonces: recorte centrado o «encajar».
- [ ] Decidir el **título-gancho** sobreimpreso: solo es posible con `veed/subtitles` (VEED vía fal, ~0,10 $/min, mínimo 1 min por clip ≈ 10 créditos);
  hay que probar antes que no añade marca de agua y declarar a VEED como subencargado.

## Pruebas reales que faltan
- [x] Subida directa a YouTube probada en real (265 MB, programado con publishAt) — 2026-11-24.
- [ ] Firmar el DPA de fal.ai y pedir su lista de subencargados (incluye ElevenLabs vía auto-subtitle).

## Decisiones (cuestan dinero o son legales)
- [ ] **Dominio propio** (~10-15 €/año): necesario para la verificación de Google y para enviar emails; recomendado para TikTok y Meta.
- [ ] **Abogado**: revisar y completar los textos legales (privacidad, términos, cookies, aviso legal, afiliados) antes de abrir la app.
- [ ] **Autónomo o sociedad**: imprescindible para que Meta (Instagram para otros usuarios) y Microsoft aprueben la app. Google y TikTok aceptan persona física.
- [ ] **Gmail para otros usuarios**: exige evaluación de seguridad anual de pago (CASA). Alternativa: solo Outlook.
- [ ] **Pagos**: Stripe exige alta fiscal; decidir cuándo (o Paddle como alternativa).

## Revisiones de apps (cuando estén las decisiones de arriba)
- [ ] Google / YouTube → `docs/app-review/google.md`
- [ ] TikTok (revisión + auditoría Direct Post) → `docs/app-review/tiktok.md`
- [ ] Meta (verificación de empresa + App Review) → `docs/app-review/meta.md`
- [ ] Microsoft (verificación de editor) → `docs/app-review/microsoft.md`
