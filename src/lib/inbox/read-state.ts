import type { InboxChannel } from "@/lib/supabase/types/inbox";

/**
 * «Marcar como leído» — lógica PURA.
 * En Kreo se marca SIEMPRE (columna `unread` de hilos y comentarios). En la plataforma solo si el permiso ya concedido
 * lo permite; hoy no se pide ninguno, así que el cambio se queda en Kreo:
 *  - Gmail: quitar la etiqueta UNREAD exige `gmail.modify` (restringido); Kreo pide `gmail.readonly` + `gmail.send`.
 *    https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/modify
 *  - Outlook: `isRead` exige `Mail.ReadWrite`; Kreo pide `Mail.Read` + `Mail.Send`.
 *    https://learn.microsoft.com/en-us/graph/api/message-update
 *  - Instagram DMs: la única vía es el `mark_seen` de la Send API, que le muestra «Visto» a la otra persona: no se usa
 *    (un cambio de estado interno no debe notificar a terceros).
 *  - Comentarios de Instagram: no tienen estado de lectura en la API.
 */
export const READ_SCOPES = ["all", "instagram", "comments", "gmail", "outlook"] as const;
export type ReadScope = (typeof READ_SCOPES)[number];

export function isReadScope(v: unknown): v is ReadScope {
  return typeof v === "string" && (READ_SCOPES as readonly string[]).includes(v);
}

/** Canales de hilos (DMs/emails) que cubre cada opción. «comments» no toca hilos. */
export function threadChannelsFor(scope: ReadScope): InboxChannel[] {
  if (scope === "all") return ["instagram", "gmail", "outlook"];
  if (scope === "comments") return [];
  return [scope];
}

export function includesComments(scope: ReadScope): boolean {
  return scope === "all" || scope === "comments";
}

export const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

/** ¿Se puede reflejar «leído» también en la plataforma con los permisos ya concedidos? */
export function providerCanMarkRead(channel: string, grantedScopes: readonly string[]): boolean {
  const scopes = grantedScopes.map((s) => s.toLowerCase());
  if (channel === "gmail") return scopes.includes(GMAIL_MODIFY_SCOPE) || scopes.includes("https://mail.google.com/");
  if (channel === "outlook") return scopes.some((s) => s.endsWith("mail.readwrite"));
  return false;
}

/** Máximo de hilos que se marcan también en la plataforma por acción masiva (cuotas de Google/Microsoft). */
export const PROVIDER_READ_BATCH = 50;
