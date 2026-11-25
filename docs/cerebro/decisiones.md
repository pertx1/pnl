# Decisiones

Lo más reciente arriba. Formato: fecha · decisión · por qué.

- **2026-11-24** · Clipper: no usar los «reframe» generativos de fal (LTX, Luma, MiniMax, Wan) · no siguen a la persona e inventan píxeles alrededor de alguien real; en su lugar, recorte centrado o «encajar» con vista previa del encuadre.
- **2026-11-24** · «Programar clips» crea borradores (o pendientes de aprobación si cumplen las reglas) · la aprobación siempre es humana (regla nº 1).

- **2026-11-23** · Los asistentes de IA conectados (Claude, etc.) no gastan créditos salvo que Oier lo active por conexión, con tope diario (50 por defecto). Motivo: Kreo no puede garantizar que el asistente pida confirmación.
- **2026-11-23** · Crear este cerebro en `docs/cerebro/` cargado desde `CLAUDE.md` · que cualquier chat de Claude Code siga el hilo sin explicaciones.
- **2026-11-22** · No enviar todavía las revisiones de apps · faltan dominio propio, textos legales revisados y (Meta/Microsoft) empresa registrada; enviarlas ahora casi garantiza rechazo.
- **2026-11-22** · Quitar permisos que el código no usa (YouTube Analytics, TikTok video.list/upload, IG insights) · las plataformas rechazan permisos sin uso.
- **2026-11-22** · Workspace de Oier en plan interno «Fundador» (no público) · usar la app sin topes.
- **2026-11-21** · Estudio de IA estilo galería a pantalla completa con barra flotante (referencia visual aportada por Oier) · más rápido de usar en ordenador.
- **2026-11-21** · Imágenes por la cola de fal.ai + barrido de generaciones atascadas · nunca cobrar sin resultado.
- **2026-11-20** · Dominio público `kreo-nine.vercel.app` en todas las consolas · el alias del equipo está protegido por Vercel.
- **2026-11-19** · La lima solo para acción principal, selección y cursor `kreo_` · evitar el aspecto de plantilla y dar más fuerza a la marca.
- **2026-11-19** · Barra de pestañas inferior en móvil · navegación principal accesible con el pulgar (HIG).
- **2026-11-19** · Oier usa la app él primero; pagos (Stripe) más adelante · evitar alta de autónomo/IVA por ahora.
- **2026-11-18** · Nombre **Kreo**, dirección visual A «Terminal de crecimiento» (oscuro + lima).
- **2026-11-18** · Stack: Next.js 16 + Supabase (UE) + Inngest + Vercel + fal.ai + Anthropic + ElevenLabs.
- **2026-11-24** · `/app` es el inicio general (todos los proyectos + agenda); la lista de proyectos se mueve a `/app/projects` · al entrar se ve todo de un vistazo.
- **2026-11-24** · La agenda es del usuario (privada, RLS solo propio) y guarda horas locales + zona horaria · «L-V 9-17» no se descuadra con el cambio de hora.
- **2026-11-25** · TikTok sin auditar: por defecto «Enviar a mis borradores de TikTok» (API oficial de inbox, `video.upload`) y, si no se puede, «Listo para subir a mano» · la documentación oficial solo limita Direct Post a cuentas privadas; nada de automatizar el navegador ni librerías no oficiales. Vuelve `video.upload` (revierte en parte la decisión del 2026-11-22).
- **2026-11-25** · Dirección visual C «Creador» con los colores actuales (sin coral/violeta/verde de la maqueta): Bricolage Grotesque en títulos, formas redondeadas, publicaciones como miniaturas, selector de proyectos y «Crear» siempre a mano · Oier quiere algo más fácil, visual e intuitivo. El botón «Crear» va en relleno de texto (no lima) para respetar «una sola lima por pantalla».
- **2026-11-26** · Bandeja de Instagram con **Instagram API with Unified Login** (config 1203482298883759, token BISU) en vez de Instagram Login (no disponible para apps nuevas) o del Facebook Login clásico con página · solo exige `instagram_basic` + `instagram_manage_messages` (+ `instagram_manage_comments`), sin `pages_*`. `ads_*` e `instagram_content_publish` sobran en esa configuración.
- **2026-11-26** · «Marcar como leído» solo en Kreo; no pedir `gmail.modify` ni `Mail.ReadWrite` · `gmail.modify` es restringido (misma evaluación CASA que `gmail.readonly`, pero amplía lo que Kreo puede cambiar en el buzón) y `Mail.ReadWrite` amplía el permiso en Microsoft; el beneficio (sincronizar el estado leído) no compensa. El código lo haría solo si el permiso ya estuviera concedido.
