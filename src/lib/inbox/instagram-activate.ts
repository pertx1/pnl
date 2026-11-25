import "server-only";
import { IG_LOGIN_MARK } from "@/lib/social/instagram-login";
import { upsertConnection } from "./connections";
import { igLoginSubscribe } from "./providers/instagram-login";

/**
 * Activa la Bandeja de una cuenta de Instagram conectada con Instagram Login: suscribe la cuenta al webhook de
 * mensajes y guarda la conexión con su propia copia cifrada del token de Instagram (se refresca aparte).
 * Llamar SOLO tras comprobar con la sesión del usuario que es editor del proyecto y que la cuenta es de ese proyecto.
 */
export async function activateIgLoginInbox(o: {
  workspaceId: string;
  projectId: string;
  userId: string;
  account: { id: string; external_id: string; handle: string | null };
  token: { accessToken: string; accessExpiresAt?: Date };
  grantedScopes: string[];
}): Promise<string> {
  await igLoginSubscribe(o.account.external_id, o.token.accessToken);
  return upsertConnection({
    workspaceId: o.workspaceId,
    projectId: o.projectId,
    userId: o.userId,
    channel: "instagram",
    externalId: o.account.external_id,
    displayName: o.account.handle ? `@${o.account.handle}` : null,
    socialAccountId: o.account.id,
    grantedScopes: o.grantedScopes,
    metadata: { login: IG_LOGIN_MARK },
    tokens: { accessToken: o.token.accessToken, accessExpiresAt: o.token.accessExpiresAt },
  });
}
