# Pendientes de Oier

Lo que solo puedes hacer tú (consolas, pagos, decisiones). En orden. Tacha con `[x]` cuando esté hecho
(o dile a Claude «hecho lo de X» y lo tacha él).

## Ahora (para usar la app al 100 %)
- [ ] **Añadir Kreo como conector en Claude**: claude.ai → Ajustes → Conectores → «Añadir conector personalizado» →
  URL `https://kreo-nine.vercel.app/api/mcp` → Conectar → iniciar sesión en Kreo → elegir workspace → Permitir.
- [ ] **Conectar Inngest con el dominio público** (sin esto no se publica nada programado ni se actualizan estadísticas).
  1. https://app.inngest.com/settings/integrations/vercel → proyecto kreo → «Custom Production Domain» = `kreo-nine.vercel.app`
  2. https://app.inngest.com/env/production/apps → «Resync» (o «Sync new app» con `https://kreo-nine.vercel.app/api/inngest`)
  3. Decirle a Claude «hecho lo de Inngest» para que lo compruebe.
- [ ] **Reconectar YouTube** (Cuentas → desconectar y conectar) para dar el permiso de listas de reproducción.
- [ ] **Probar una publicación real**: programar una en Instagram para dentro de 5 min y avisar a Claude.
- [ ] **Conectar Gmail u Outlook** en la Bandeja (opcional).

## Limpieza de consolas (5 min)
- [ ] Google: añadir el scope `youtube.force-ssl` en [Data access](https://console.cloud.google.com/auth/scopes?project=kreo-515218) y quitar `yt-analytics.readonly`.
- [ ] Google: inhabilitar el secreto viejo del cliente «Kreo web» (el que termina en …MyfB).
- [ ] TikTok (Kreo Sandbox): desmarcar los scopes `video.list` y `video.upload` (el código ya no los pide).
- [ ] Meta: en la configuración de login `29290673200559330`, quitar `instagram_manage_insights`.
- [ ] Supabase: borrar la clave secreta antigua que no funcionaba (dejar solo `kreo_vercel`) en [API keys](https://supabase.com/dashboard/project/qowvtzqqrmccuavqtsgr/settings/api-keys).
- [ ] Supabase: aceptar la confirmación cuando Claude borre la cuenta de prueba `qa@kreo-qa.invalid`.

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
