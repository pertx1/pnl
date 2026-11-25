import { parseCommentChange, type IgCommentChange } from "./comments";
import type { IgWebhookEvent } from "./sync";

/**
 * Payload del webhook de mensajes de Instagram (mismo formato con Instagram Login y con Facebook Login):
 *   { object: "instagram", entry: [{ id: <id de la cuenta profesional>, time, messaging: [{ sender, recipient, timestamp, message }] }] }
 * Doc: https://developers.facebook.com/documentation/instagram-platform/webhooks/examples
 * ("entry.id: The Instagram professional account ID of your app user").
 * Comentarios (Unified Login / Facebook Login for Business): `entry[].changes[] = { field: "comments", value: {…} }`.
 * Función PURA: valida la forma y acota tamaños (máx. 50 entradas × 100 eventos). Nunca lanza.
 */
export type IgWebhookBatch = { accountId: string; events: IgWebhookEvent[]; comments: IgCommentChange[] };

export function parseIgWebhookPayload(raw: string): IgWebhookBatch[] {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return [];
  }
  // Normalmente es un objeto; aceptamos también una lista de objetos por si llegan agrupados.
  const roots = (Array.isArray(payload) ? payload.slice(0, 5) : [payload]) as ({ object?: unknown; entry?: unknown } | null)[];
  const entries = roots.flatMap((p) => (p && p.object === "instagram" && Array.isArray(p.entry) ? p.entry : []));
  const out: IgWebhookBatch[] = [];
  for (const e of entries.slice(0, 50)) {
    const entry = e as { id?: unknown; messaging?: unknown; changes?: unknown } | null;
    const id = typeof entry?.id === "string" || typeof entry?.id === "number" ? String(entry.id) : "";
    if (!/^\d{1,30}$/.test(id)) continue;
    const events = Array.isArray(entry?.messaging)
      ? (entry.messaging as unknown[]).slice(0, 100).filter((ev): ev is IgWebhookEvent => Boolean(ev) && typeof ev === "object")
      : [];
    const comments = Array.isArray(entry?.changes)
      ? (entry.changes as unknown[])
          .slice(0, 100)
          .map((c) => c as { field?: unknown; value?: unknown } | null)
          .filter((c) => c?.field === "comments")
          .map((c) => parseCommentChange(c!.value))
          .filter((c): c is IgCommentChange => c !== null)
      : [];
    if (events.length || comments.length) out.push({ accountId: id, events, comments });
  }
  return out;
}
