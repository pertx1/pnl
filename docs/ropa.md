# Registro de actividades de tratamiento (art. 30 RGPD)

_Última actualización: [FECHA]_

> Borrador. Revisar con un abogado y mantener actualizado con cada módulo nuevo.

## Datos del responsable

- Responsable: [RAZÓN SOCIAL] · NIF [NIF] · [DOMICILIO]
- Contacto: [EMAIL DE CONTACTO] · Privacidad: [EMAIL DPD/PRIVACIDAD]
- Delegado de Protección de Datos: [NOMBRE O "no designado" + justificación de por qué no es obligatorio (art. 37 RGPD / art. 34 LOPDGDD)] [VALIDAR CON ABOGADO]
- Medidas de seguridad comunes (art. 32 RGPD), referidas en la columna "Seguridad": **M1** RLS en todas las tablas y aislamiento por workspace · **M2** cifrado TLS en tránsito y en reposo · **M3** tokens de terceros cifrados a nivel de aplicación · **M4** secretos fuera del repo (variables sensibles) · **M5** logs sin datos personales y eventos de cola solo con IDs · **M6** control de acceso por roles y 2FA disponible · **M7** copias de seguridad (plan Pro de Supabase) · **M8** validación de entrada (zod) · **M9** DPA con todos los encargados.

## A. Actividades como responsable (art. 30.1)

| # | Actividad | Finalidad | Base legal | Interesados | Categorías de datos | Destinatarios / encargados | Transferencias internacionales | Plazo de supresión | Seguridad |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Gestión de cuentas de usuario | Alta, autenticación, recuperación de contraseña, 2FA | 6.1.b | Usuarios | Identificativos (email, nombre), credenciales (hash), idioma, versión de términos aceptada, factores 2FA | Supabase, proveedor de email transaccional | Supabase (soporte EE. UU.): CCT | Vida de la cuenta + [30] días; backups [90] días | M1-M9 |
| 2 | Workspaces, equipo y roles | Trabajo colaborativo | 6.1.b; invitados 6.1.f | Usuarios, invitados | Email del invitado, rol, registro de actividad | Supabase, email transaccional | CCT | Vida del workspace; invitaciones no aceptadas [30] días | M1-M9 |
| 3 | Proyectos y brand kit | Prestación del servicio | 6.1.b | Usuarios (y personas que aparezcan en logos/material de marca) | Textos, imágenes, colores, enlaces | Supabase | CCT | Vida de la cuenta | M1-M9 |
| 4 | Cuentas sociales conectadas (TikTok, Instagram, YouTube) | Publicar, programar, estadísticas | 6.1.b | Usuarios | ID y nombre de cuenta, avatar, scopes, tokens cifrados, publicaciones y métricas propias | Supabase, Inngest (solo IDs), plataformas a instrucción del usuario | CCT / DPF | Hasta desconexión; borrado ≤ 7 días tras revocación (YouTube: datos no autorizados refrescados/borrados cada ≤ 30 días) | M1-M9 |
| 5 | Programación y publicación | Publicar contenido aprobado por el usuario | 6.1.b | Usuarios; personas que aparezcan en el contenido | Archivos multimedia, textos, configuración, estado | Supabase, Vercel, Inngest, plataformas | CCT / DPF | Archivo hasta [30] días tras publicar; registro mientras la cuenta exista | M1-M9 |
| 6 | Generación de contenido con IA | Propuestas de texto, imagen, vídeo, voz y música | 6.1.b | Usuarios; terceros mencionados en prompts | Prompts, contexto de marca, archivos de referencia, resultados | Anthropic, fal.ai, Replicate, ElevenLabs | EE. UU.: CCT / DPF | Biblioteca: hasta que el usuario borre; proveedor: según DPA [PLAZOS] | M1-M9; sin entrenamiento |
| 7 | Análisis de competencia | Analítica de cuentas públicas | 6.1.f (LIA pendiente) | Titulares de cuentas profesionales públicas | Nombre de cuenta, métricas y publicaciones públicas | YouTube Data API, IG Business Discovery, [PROVEEDOR TIKTOK] | Según proveedor | [PLAZO, propuesta: refresco ≤ 30 días; borrado al quitar el competidor] | M1-M9 |
| 8 | Buscador de productos (Meta Ad Library) | Inteligencia de mercado sobre anuncios | 6.1.f (LIA pendiente) | Anunciantes (páginas) | Nombre de página, contenido de anuncios públicos | Meta Ad Library API | — | [PLAZO, propuesta: caché ≤ 30 días] | M1-M9 |
| 9 | Facturación, suscripciones y créditos | Cobro, facturación, impuestos, saldo de créditos | 6.1.b; 6.1.c | Clientes | Identificativos, fiscales, transacciones, ledger de créditos | Stripe, asesoría fiscal | Stripe: DPF + CCT | Facturas 6 años (art. 30 CCom); fiscal 4 años (LGT); después bloqueo/borrado | M1-M9 |
| 10 | Soporte | Atender consultas | 6.1.b / 6.1.f | Usuarios y no usuarios | Identificativos, contenido de la consulta | Proveedor de email corporativo | Según proveedor | [PLAZO, propuesta: 2 años tras cierre] | M2, M4, M9 |
| 11 | Seguridad, logs y prevención del abuso | Proteger el servicio, cumplir límites de plataformas | 6.1.f | Usuarios, visitantes | IP, registros de acceso, eventos de seguridad | Vercel, Supabase | CCT / DPF | [90] días | M1-M9 |
| 12 | Lista de espera y comunicaciones comerciales | Newsletter / novedades | 6.1.a (doble opt-in), art. 21 LSSI | Suscriptores | Email, idioma, prueba de consentimiento (fecha, IP, texto, confirmación) | Proveedor de email (UE) | — (UE) | Hasta la baja; prueba de consentimiento bloqueada durante la prescripción | M2, M4, M9 |
| 13 | Cookies técnicas y registro de consentimiento | Funcionamiento; prueba del consentimiento de cookies | Art. 22.2 LSSI; 6.1.c | Visitantes, usuarios | Identificadores de sesión, preferencias | Vercel, Supabase | CCT / DPF | Ver política de cookies | M2, M5 |
| 14 | Programa de afiliados | Gestión y pago de comisiones | 6.1.b; 6.1.c | Afiliados; referidos (seudonimizados) | Identificativos, fiscales, bancarios, conversiones | [PROVEEDOR AFILIADOS], Stripe | Según proveedor | Relación + plazos fiscales (4-6 años) | M1-M9 |
| 15 | Ejercicio de derechos RGPD | Atender solicitudes (export, borrado, etc.) | 6.1.c | Usuarios y terceros | Identificativos, solicitud, respuesta | — | — | [3] años | M2, M6 |
| 16 | Integraciones Gmail / Outlook (datos del propio usuario) | Conectar buzón propio | 6.1.b | Usuarios | Email, tokens cifrados | Google, Microsoft (a instrucción) | — | Hasta desconexión | M1-M9; Limited Use de Google |

## B. Actividades como encargado por cuenta de clientes (art. 30.2)

Aplica cuando el cliente usa Kreo en su actividad profesional para tratar datos de terceros. Requiere un DPA para clientes (pendiente de redactar). [VALIDAR ROLES CON ABOGADO]

| # | Categoría de tratamiento | Responsable | Interesados | Datos | Subencargados | Transferencias | Plazo | Seguridad |
|---|---|---|---|---|---|---|---|---|
| E1 | Bandeja unificada (DMs de Instagram, Gmail, Outlook) | Cliente de Kreo | Personas que escriben al cliente | Nombre de usuario/email, contenido de mensajes | Supabase, Vercel, Anthropic (solo si el cliente pide propuesta de respuesta) | CCT / DPF | Caché ≤ [30] días desde la última actividad; metadatos hasta desconexión | M1-M9; Limited Use; ventana 24 h de Meta |
| E2 | Datos de la tienda Shopify | Comerciante (cliente) | Clientes de la tienda | Pedidos (importe, productos, descuentos) sin datos identificativos de nivel 2 salvo necesidad | Supabase, Vercel | CCT / DPF | Hasta desinstalación + ≤ [30] días; webhooks `customers/redact`, `shop/redact` | M1-M9 |
| E3 | Datos de clientes de agencias (marcas gestionadas, informes marca blanca) | Agencia (cliente) | Clientes de la agencia y sus contactos | Contenidos, métricas, contactos | Supabase, Vercel, proveedores IA | CCT / DPF | Vida del workspace | M1-M9 |

## Pendientes

- Evaluaciones de interés legítimo (LIA) para las actividades 7, 8 y 11.
- Valorar una EIPD (art. 35 RGPD) para la bandeja unificada (E1) y la combinación IA + datos de terceros: tratamiento a escala de comunicaciones de terceros con tecnología nueva. [VALIDAR CON ABOGADO]
- Confirmar plazos marcados entre corchetes y reflejarlos en la política de privacidad.
- Redactar el DPA para clientes (art. 28.3 RGPD).
