# TikTok · App Review + auditoría de Content Posting API (Direct Post)

> Verificado el **2026-11-22**. App "Kreo App" (`7709972032187926548`), **sandbox**, productos Login Kit + Content
> Posting API (Direct Post activado), scopes `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`,
> `video.publish`, `video.upload`.

## 0. Son dos procesos distintos

1. **App Review** (pasar la app de sandbox a producción con sus productos y scopes). Requiere web completa, ToS y
   privacidad visibles, **URL properties verificadas**, vídeo(s) de demo grabados en **sandbox**, explicación de cada
   producto y scope. Sin plazo oficial ("we do not provide an official review timeline").
2. **Auditoría de Content Posting API** (<https://developers.tiktok.com/application/content-posting-api>). Hasta
   aprobarla: "All content posted by unaudited clients will be restricted to private viewing mode", y además la **cuenta**
   del creador debe ser privada (`unaudited_client_can_only_post_to_private_accounts`, 403) y hay tope de usuarios
   activos (`reached_active_user_cap`). La auditoría comprueba el cumplimiento de las **Content Sharing Guidelines**.

TikTok **no** exige verificación de empresa para estos productos (la "Business verification" documentada es para TikTok
Minis). Basta persona física con datos reales en los textos legales.

## 1. Requisitos previos (checklist)

- [ ] **Web**: "cannot be a landing page or login page"; "must have an externally facing fully developed website". Hoy la
  home dice "status: waitlist open" y marca módulos como "Coming soon" → riesgo de rechazo "app still in development or
  testing". Dejar alta abierta y describir lo que funciona (B8 del README).
- [ ] **ToS y privacidad visibles sin abrir un menú** (hoy están en el pie: OK) y activos, sin marcadores (B2).
- [ ] **URL properties verificadas** (obligatorio para apps nuevas; "You must verify URL properties for all URLs in your
  app configuration"): web, ToS y privacidad. Portal: Development configuration → pestaña **Webhooks** → *Verify
  properties* → por **dominio** o por **URL prefix** (descargar el archivo de firma y servirlo desde `public/`).
  Hacerlo **ya con el dominio definitivo**: cambiar de dominio después obliga a repetir verificación y revisión.
  Las URLs que devuelven 3xx no valen.
- [ ] **Nombre de la app**: cambiar "Kreo App" → **"Kreo"** (motivo de rechazo: nombre que "describes the app rather than
  matching its name or brand"). Icono claro, sin parecerse a marcas conocidas.
- [ ] **Quitar scopes no usados** ("Unneeded products or scopes are left selected" = rechazo):
  - `video.list`: no se llama a `/v2/video/list/`. Quitar, o implementar "Top posts" de TikTok en Analytics.
  - `video.upload`: no se usa la subida a borradores. Quitar, o implementar "Send to TikTok drafts" (útil como
    alternativa mientras no haya auditoría; verificar antes sus condiciones en la doc oficial).
  - Quitar también los productos que no se usen.
- [ ] **Cumplir las Content Sharing Guidelines** (§2). Son el núcleo de la auditoría.
- [ ] Cuenta de TikTok de prueba **en privado** y añadida al sandbox (README §3).
- [ ] Redirect URI web: `https://<DOMINIO>/api/oauth/tiktok/callback`.

## 2. Huecos de UX frente a las Content Sharing Guidelines (arreglar en código antes de grabar)

Estado del editor `src/app/app/(shell)/p/[projectId]/posts/post-editor.tsx` (`TikTokOptions`) y del worker `publish.ts`:

| Punto oficial | Estado en Kreo | Qué falta |
|---|---|---|
| 1a Mostrar el **nickname** del creador | ⚠️ "Posting as @handle" con el handle guardado | Usar `creator_nickname` (y avatar) de `creator_info/query` al abrir el editor |
| 1b Si el creador no puede publicar ahora, parar y avisar | ❌ `creator_info` solo se consulta en el worker | Llamar a `creator_info` **al abrir el editor** (server action) y bloquear con mensaje |
| 1c Respetar `max_video_post_duration_sec` | ❌ | Leer la duración del vídeo en el navegador y bloquear si excede |
| 2b Privacidad elegida a mano, **sin valor por defecto**, opciones = `privacy_level_options` | ⚠️ sin defecto ✅, pero lista fija de 4 opciones | Mostrar solo las opciones devueltas por `creator_info` (mientras no haya auditoría solo saldrá `SELF_ONLY`) |
| 2c Comentarios/Dúo/Stitch desactivados por defecto; **en gris** si el creador los tiene desactivados; en fotos solo comentarios | ⚠️ desactivados por defecto ✅; no se ponen en gris (el worker los fuerza en silencio) | Deshabilitar en la UI según `comment_disabled`/`duet_disabled`/`stitch_disabled` |
| 3a Toggle **"Disclose video content"** apagado por defecto → al activarlo, casillas "Your brand" / "Branded content"; si activado sin ninguna, **botón de publicar deshabilitado** con "You need to indicate if your content promotes yourself, a third party, or both." | ❌ las casillas están siempre visibles, sin toggle ni bloqueo | Añadir el toggle, la validación y el texto exacto |
| 3a Textos: "Your photo/video will be labeled as 'Promotional content'" / "'Paid partnership'" (ambas → Paid partnership) | ⚠️ textos parecidos | Usar los textos exactos y el caso "ambas" |
| 3b Branded content solo **public/friends**; opción privada deshabilitada con "Branded content visibility cannot be set to private." | ⚠️ `SELF_ONLY` deshabilitado ✅, sin tooltip; "Followers" sigue permitido | Tooltip exacto; por prudencia limitar a Everyone/Friends como dice la guía |
| 4 Declaración antes del botón: "By posting, you agree to TikTok's Music Usage Confirmation." / "…Branded Content Policy and Music Usage Confirmation." **con enlaces** | ⚠️ texto ✅, **sin enlaces** | Enlazar a las páginas oficiales de TikTok y colocarlo junto al botón de aprobar |
| 5a Vista previa del contenido | ⚠️ miniatura de 96 px | Reproductor de vista previa en el bloque de TikTok |
| 5b Sin marcas de agua; título y hashtags editables | ✅ | — |
| 5c Enviar a TikTok solo tras **consentimiento expreso** | ✅ solo tras "Approve" | Dejar claro en la UI que aprobar = consentimiento para subir a esa hora; **recomendado**: que apruebe la persona que conectó la cuenta de TikTok (hoy puede aprobar cualquier admin del workspace) |
| 5d Avisar de que "it may take a few minutes for the content to process and be visible on their profile" | ❌ | Mostrarlo tras aprobar y en el calendario |
| 5e Mostrar el estado de publicación (polling) | ✅ worker + calendario | — |
| Solo vídeo (fotos requieren `PULL_FROM_URL` desde dominio verificado) | ⚠️ el editor admite imágenes y el worker falla con `unsupported_media` | Exigir vídeo para TikTok en `rules.ts` o implementar fotos con dominio verificado |
| `is_aigc` para contenido IA | ✅ automático y no desactivable | — |

## 3. Descripción de la app y de los productos (pegar en inglés)

### App description
```
Kreo is a web app for content creators, small brands and agencies to plan, review and publish their own content
to their own social accounts through official APIs, and to see their accounts' official statistics.
Human-in-the-loop by design: AI can draft caption suggestions, but nothing is posted to TikTok until a person
reviews the post (preview, caption, privacy, interaction settings, commercial content disclosure) and clicks
"Approve". Kreo never automates engagement (no likes, follows, comments, views or DMs) and never asks for TikTok
passwords. AI-generated content is labeled automatically with is_aigc=true and the label cannot be removed when
the post contains AI-generated media.
```

### Login Kit
```
Used so the creator can connect their own TikTok account to a Kreo project with TikTok's official OAuth
(Login Kit for Web). Kreo stores the access/refresh tokens encrypted (AES-256-GCM), shows the connected account
(avatar, display name, username) in Project > Accounts, handles token refresh, and revokes the token
(oauth/revoke) and deletes the data when the user clicks "Disconnect".
```

### Content Posting API (Direct Post)
```
Used to publish the creator's own approved video to their own TikTok account at the time they scheduled.
Before posting, the editor queries creator_info and shows the creator's nickname, only the privacy options
returned by TikTok (no default), interaction toggles off by default (greyed out if disabled by the creator), the
max video duration check, the commercial content disclosure toggle (Your brand / Branded content) with TikTok's
labels, the Music Usage Confirmation / Branded Content Policy declaration with links, and a preview. The upload
(FILE_UPLOAD) only starts after the user's explicit approval, and the user sees the publishing status
(status/fetch) and a notice that processing can take a few minutes.
```

## 4. Justificación de cada scope (pegar en inglés)

### `user.info.basic`
```
Read open_id, avatar and display name to identify the connected account and show "Posting as <nickname>" so the
creator always knows which account will receive the post. UI: Project > Accounts card; post editor TikTok block.
```
### `user.info.profile`
```
Read the username (@handle) so the creator can distinguish multiple connected accounts in the account selector of
the post editor, the calendar and analytics. No other profile fields are used.
```
### `user.info.stats`
```
Read follower_count, likes_count and video_count of the creator's own account to show their own growth in
Project > Analytics (refreshed every 6 hours, own account only, can be exported to CSV by the user).
```
### `video.publish`
```
Direct Post of the creator's own approved video to their own account via the Content Posting API (creator_info
query, video/init with FILE_UPLOAD, status/fetch). Used only for posts approved by a human in Kreo.
```
### `video.list` — **solo si se implementa**
```
List the creator's own videos (id, title, create_time, view/like/comment/share counts) to show "Top posts" for
their own account in Analytics and to link a post published from Kreo to its public video.
```
### `video.upload` — **solo si se implementa**
```
Alternative flow: send the approved video to the creator's TikTok drafts (inbox) so they finish and post it
in the TikTok app themselves.
```

## 5. Instrucciones para el revisor (pegar en inglés)

```
Website: https://<DOMINIO>/ (Terms and Privacy links in the footer).
1. Sign in at https://<DOMINIO>/login with the Kreo test account provided (2FA disabled).
2. Open project "Demo Coffee Shop" > Accounts > TikTok > Connect, and authorize with a TikTok sandbox test user.
   The connected account (avatar, nickname, @username) appears.
3. Posts > New post: select the demo video, tick the TikTok account. The TikTok block shows "Posting as
   <nickname>", the privacy dropdown with no default (only the options returned by creator_info), interaction
   toggles off, the "Disclose video content" toggle, the declaration with links, and a preview.
4. Choose a privacy option, review, and click "Approve" (or "Approve and schedule" with a date).
5. Calendar shows the status until "Published"; the video appears on the TikTok profile (private while the
   client is unaudited).
6. Analytics shows the account's own follower/like/video counts.
7. Accounts > TikTok > Disconnect revokes the token.
```

## 6. Guion del vídeo de demostración (sandbox)

Requisitos: grabado en **sandbox**; el **dominio que se ve en el vídeo = el de la web declarada**; mostrar **todos** los
productos y scopes seleccionados; hasta 5 vídeos de ≤ 50 MB; UI clara (1080p, cursor grande). Sin audio necesario;
rótulos en inglés. Duración 3-4 min.

| # | Pantalla / acción | Rótulo (EN) |
|---|---|---|
| 1 | Home `https://<DOMINIO>/` con barra de direcciones; pie con Terms y Privacy | "Kreo website – Terms and Privacy visible in the footer" |
| 2 | Login en Kreo con la cuenta de prueba; proyecto "Demo Coffee Shop" | "Test user signed in" |
| 3 | Accounts → TikTok → Connect → pantalla oficial de TikTok con la lista de permisos | "Login Kit: official TikTok OAuth. Scopes: user.info.basic, user.info.profile, user.info.stats, video.publish" |
| 4 | Autorizar → tarjeta con avatar, nombre y @usuario | "user.info.basic + user.info.profile: identify the connected account" |
| 5 | Posts → New post; subir/seleccionar vídeo; el Guionista propone captions → elegir uno y editarlo | "AI only suggests. The creator edits the text" |
| 6 | Marcar la cuenta de TikTok: zoom al bloque TikTok: nickname, vista previa, privacidad vacía | "creator_info: nickname, allowed privacy options, no default value" |
| 7 | Abrir el desplegable de privacidad y elegir a mano | "Privacy selected manually" |
| 8 | Toggles de comentarios/dúo/stitch apagados; activar uno | "Interactions are off by default and must be turned on by the user" |
| 9 | Activar "Disclose video content" sin marcar nada → botón deshabilitado + tooltip | "Commercial disclosure required: publish disabled until an option is selected" |
| 10 | Marcar "Branded content" → privado deshabilitado + tooltip; texto "Paid partnership"; declaración con enlaces | "Branded content cannot be private; Branded Content Policy and Music Usage Confirmation" |
| 11 | Si el vídeo es IA: etiqueta IA forzada | "AI-generated content is labeled with is_aigc=true" |
| 12 | Clic en "Approve" → aviso "it may take a few minutes…" | "Upload starts only after explicit approval (video.publish, FILE_UPLOAD)" |
| 13 | Calendar: estado Publishing → Published | "Publishing status via status/fetch" |
| 14 | App de TikTok (móvil o web) de la cuenta de prueba: el vídeo publicado (privado) con la etiqueta IA si aplica | "Post visible on the creator's profile (private while unaudited)" |
| 15 | Analytics: seguidores, likes, nº de vídeos | "user.info.stats: own account statistics" |
| 16 | Accounts → Disconnect | "Token revoked and data deleted" |

## 7. Formulario de auditoría de Direct Post (tras la App Review)

URL: <https://developers.tiktok.com/application/content-posting-api>. Texto base:
```
Kreo is a publishing tool for creators and small brands. Each creator connects their own account and publishes
their own videos after explicit approval. Expected volume: <N> creators in the first 3 months, typically 1-3 posts
per creator per day (Kreo enforces a conservative daily limit per account: default 3, max 10, and 1 post per
minute per account).
UX compliance: creator_info is queried when opening the editor (nickname, privacy_level_options with no default,
interaction settings off by default and greyed out when disabled by the creator, max_video_post_duration_sec),
commercial content disclosure toggle with Your brand / Branded content and the required labels, branded content
cannot be private, Music Usage Confirmation and Branded Content Policy declaration with links, preview, no
watermarks, editable title/hashtags, upload only after explicit consent, processing notice and status polling.
AI-generated content is labeled with is_aigc. Kreo does not automate engagement of any kind.
Demo video: <link> (recorded in sandbox on https://<DOMINIO>).
```

## 8. Lista de comprobación: motivos habituales de rechazo

- [ ] Web en desarrollo ("waitlist", "coming soon") o que es solo landing/login.
- [ ] ToS/privacidad no visibles sin menú, rotos o con marcadores.
- [ ] URL properties sin verificar o dominio del vídeo ≠ dominio declarado.
- [ ] Productos o scopes seleccionados que no se muestran en el vídeo (`video.list`, `video.upload` hoy).
- [ ] Nombre de app que no coincide con la marca ("Kreo App").
- [ ] Privacidad con valor por defecto o lista que no sale de `creator_info`.
- [ ] Interacciones activadas por defecto o no deshabilitadas cuando el creador las tiene apagadas.
- [ ] Falta el toggle de divulgación comercial, sus textos o los enlaces de las declaraciones.
- [ ] Se sube contenido sin consentimiento expreso, o se añaden marcas de agua.
- [ ] La cuenta de prueba no está en privado (la publicación falla con 403 en el vídeo).

Fuentes: [App Review Guidelines](https://developers.tiktok.com/doc/app-review-guidelines) ·
[Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines) ·
[Content Posting API – Get started](https://developers.tiktok.com/doc/content-posting-api-get-started) ·
[Direct Post reference](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post) ·
[Media transfer guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide) ·
[Development configuration (URL properties)](https://developers.tiktok.com/docs/en/set-up-development-configuration) ·
[Changelog](https://developers.tiktok.com/docs/en/changelog)
