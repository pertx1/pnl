# Subencargados del tratamiento

_Última actualización: [FECHA]_

Lista de proveedores que tratan datos personales por cuenta de [RAZÓN SOCIAL] (art. 28 RGPD). Mantenida por el subagente `seguridad-legal`. Antes de activar un proveedor en producción: firmar su DPA, comprobar región y garantías de transferencia y actualizar esta tabla y la sección 8 de la política de privacidad (`content/legal/*/privacidad.md`).

Leyenda de estado: **firmado** = DPA aceptado y archivado · **pendiente** = falta firmar/verificar · **por decidir** = proveedor aún no elegido.

## Proveedores activos o previstos

| Proveedor (entidad) | Finalidad | Datos tratados | Ubicación del tratamiento | Garantías de transferencia | DPA | Fase | Estado |
|---|---|---|---|---|---|---|---|
| Supabase Inc. | Base de datos, autenticación, almacenamiento de archivos | Todos los datos de la app (cuenta, workspaces, contenido, tokens cifrados) | UE: `eu-central-1` (Frankfurt, sobre AWS). Soporte y accesos de la entidad desde EE. UU. | CCT en su DPA; [VERIFICAR certificación DPF] | [supabase.com/legal/dpa](https://supabase.com/legal/dpa) | 0-1 | pendiente |
| Vercel Inc. | Alojamiento y ejecución de la app, CDN | Peticiones HTTP (IP, cookies técnicas), logs de ejecución | Funciones en `fra1` (Frankfurt); CDN global; entidad en EE. UU. | DPF [VERIFICAR] + CCT en su DPA | [vercel.com/legal/dpa](https://vercel.com/legal/dpa) | 0-1 | pendiente (además: pasar a plan Pro antes de uso comercial) |
| Inngest Inc. | Colas y tareas programadas | Solo identificadores internos en los eventos (sin datos personales por diseño) | [VERIFICAR región; EE. UU. por defecto] | [VERIFICAR] | [URL DPA PENDIENTE] | 1 | pendiente |
| Stripe Payments Europe Ltd. (Irlanda) / Stripe Inc. | Pagos, suscripciones, facturación, Stripe Tax, portal de cliente | Nombre, email, datos fiscales, dirección de facturación, datos de pago (Stripe los trata directamente) | UE y EE. UU. | DPF + CCT en su DPA. Stripe actúa además como responsable independiente para prevención de fraude y KYC | [stripe.com/legal/dpa](https://stripe.com/legal/dpa) | 1/4 | pendiente |
| [PROVEEDOR EMAIL TRANSACCIONAL] (Resend / Postmark / Brevo) | Emails transaccionales y de lista de espera (doble opt-in, baja en un clic) | Email, nombre, contenido del email | UE (requisito) | [SEGÚN PROVEEDOR] | [URL DPA PENDIENTE] | 1 | por decidir |
| Anthropic PBC / Anthropic Ireland Ltd. [VERIFICAR entidad contratante] | Generación de texto con IA | Prompts, contexto de marca, fragmentos de hilos de la bandeja cuando el usuario pide propuesta de respuesta | EE. UU. [VERIFICAR opciones de región UE] | DPF [VERIFICAR] + CCT en su DPA. Sin entrenamiento con datos de API según condiciones comerciales [VERIFICAR retención] | [URL DPA, incluido en Commercial Terms — VERIFICAR] | 1 | pendiente |
| Features and Labels Inc. (fal.ai) [VERIFICAR entidad] | Generación de imagen y vídeo | Prompts, imágenes de referencia subidas por el usuario | EE. UU. [VERIFICAR] | CCT [VERIFICAR] | [URL DPA PENDIENTE] | 1 | pendiente |
| Replicate Inc. [VERIFICAR entidad tras su adquisición] | Generación de imagen y vídeo | Prompts, imágenes de referencia | EE. UU. | CCT [VERIFICAR] | [URL DPA PENDIENTE] | 1 | pendiente |
| ElevenLabs Inc. / Eleven Labs sp. z o.o. [VERIFICAR entidad] | Voz y música con IA | Textos a locutar, prompts musicales; muestras de voz solo con consentimiento acreditado | [VERIFICAR: EE. UU. / UE] | CCT [VERIFICAR] | [URL DPA PENDIENTE] | 3 | pendiente |
| [PROVEEDOR DE DATOS PÚBLICOS DE TIKTOK] | Datos públicos estimados de perfiles de TikTok de terceros | Nombres de usuario consultados por el cliente (no recibe datos de cuentas del usuario) | [VERIFICAR] | [VERIFICAR] | [URL DPA PENDIENTE] + declaración de cumplimiento legal de su método de obtención | 2 | por decidir |
| [PROVEEDOR DE AFILIADOS] (Stripe Connect / Rewardful / Tolt) | Atribución y pago de comisiones | Datos del afiliado, conversiones | [VERIFICAR] | [VERIFICAR] | [URL DPA PENDIENTE] | 4 | por decidir |
| [PROVEEDOR EMAIL CORPORATIVO] | Buzones soporte@, privacidad@, legal@ | Comunicaciones con usuarios | [VERIFICAR] | [VERIFICAR] | [URL DPA PENDIENTE] | 1 | por decidir |
| [PROVEEDOR DE MONITORIZACIÓN DE ERRORES, si se usa] | Errores de la app | Trazas sin datos personales (filtrado obligatorio) | UE preferente | — | — | — | por decidir |

## Lo que NO son subencargados

Las plataformas que conecta el usuario (**Meta, TikTok, Google/YouTube, Microsoft, Shopify**) no son subencargados: son destinatarios a instrucción del usuario y responsables independientes de su propio tratamiento. Kreo debe cumplir sus condiciones de desarrollador (Meta Platform Terms, TikTok Developer Terms, YouTube API Services Terms y Developer Policies, Google API Services User Data Policy, Microsoft APIs Terms of Use, Shopify Partner Program Agreement y API License).

GitHub aloja el código fuente (sin datos personales de usuarios); no es subencargado mientras no contenga datos reales.

## Proceso de cambios

1. Evaluar el proveedor (región, DPA, certificaciones, opción de no entrenamiento si es IA, licencia comercial).
2. Firmar el DPA y archivarlo en [UBICACIÓN DEL ARCHIVO DE CONTRATOS].
3. Actualizar esta tabla, `docs/ropa.md` y la sección 8 de la política de privacidad (es/en).
4. Si hay clientes con DPA, avisarles con [PLAZO, propuesta: 30] días de antelación para que puedan oponerse.
