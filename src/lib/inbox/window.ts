/**
 * Ventana de mensajería de Instagram (Messenger Platform / Instagram Messaging API):
 *  - Ventana estándar: 24 h desde el último mensaje del usuario → se puede responder (messaging_type RESPONSE).
 *  - Etiqueta HUMAN_AGENT: una persona puede responder hasta 7 días después, SOLO si la app tiene aprobada
 *    la función "Human Agent" en App Review (META_HUMAN_AGENT_ENABLED=true). Nunca para mensajes automáticos.
 *  - Fuera de eso: no se puede enviar. No usamos otras etiquetas de mensaje.
 * Docs: https://developers.facebook.com/documentation/instagram-platform/overview (Messaging: windows)
 */
export const STANDARD_WINDOW_MS = 24 * 60 * 60 * 1000;
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type WindowState =
  | { canSend: true; mode: "response"; closesAt: Date }
  | { canSend: true; mode: "human_agent"; closesAt: Date }
  | { canSend: false; mode: "closed"; closesAt: Date | null };

export function messagingWindow(lastInboundAt: Date | string | null, now: Date, humanAgentEnabled: boolean): WindowState {
  if (!lastInboundAt) return { canSend: false, mode: "closed", closesAt: null };
  const last = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(last)) return { canSend: false, mode: "closed", closesAt: null };
  const elapsed = now.getTime() - last;
  if (elapsed < STANDARD_WINDOW_MS) return { canSend: true, mode: "response", closesAt: new Date(last + STANDARD_WINDOW_MS) };
  if (humanAgentEnabled && elapsed < HUMAN_AGENT_WINDOW_MS) return { canSend: true, mode: "human_agent", closesAt: new Date(last + HUMAN_AGENT_WINDOW_MS) };
  return { canSend: false, mode: "closed", closesAt: new Date(last + (humanAgentEnabled ? HUMAN_AGENT_WINDOW_MS : STANDARD_WINDOW_MS)) };
}

/** Límite de longitud del texto de un DM de Instagram (la doc indica < 1.000 caracteres / ≤ 1.000 bytes). */
export const IG_MAX_BYTES = 1000;
export function fitsInstagram(text: string) {
  return new TextEncoder().encode(text).byteLength <= IG_MAX_BYTES;
}
