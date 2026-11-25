import "server-only";
import { upsertConnection } from "./connections";
import { FB_SCOPE_COMMENTS, IG_UNIFIED_MARK, LEGACY_REQUIRED_SCOPES, missingScopes, UNIFIED_REQUIRED_SCOPES, webhookFields } from "./meta-scopes";
import {
  igAssignedAccounts,
  igClientBusinessId,
  igExchangeCode,
  igLongLived,
  igPages,
  igSubscribeAccount,
  igSubscribePage,
  igTokenInfo,
} from "./providers/instagram";
import { InboxError } from "./config";

type Base = { workspaceId: string; projectId: string; userId: string };
type Result = { ok: true; connectionId: string } | { ok: false; error: "missing_scopes" | "no_matching_account" };

/**
 * Vuelta de Facebook Login for Business para la Bandeja. Llamar SOLO tras validar estado/PKCE y comprobar con la sesión
 * del usuario que es editor del proyecto y que `account` (cuenta de Instagram de Cuentas) es de ese proyecto.
 *
 * 1) Unified Login (si `/me/assigned_instagram_accounts` responde): exige instagram_basic + instagram_manage_messages;
 *    instagram_manage_comments es opcional (activa «Comentarios»). Sin página ni `pages_*`.
 * 2) Si no, Facebook Login clásico: token largo → `/me/accounts` → token de página (exige pages_show_list y
 *    pages_manage_metadata, además de los de Instagram).
 * Logs: solo nombres de permisos y códigos (nunca tokens ni datos personales).
 */
export async function connectInstagramFacebook(o: Base & { code: string; redirectUri: string; account: { id: string; external_id: string; handle: string | null } }): Promise<Result> {
  const { accessToken, expiresIn } = await igExchangeCode(o.code, o.redirectUri);
  const assigned = await igAssignedAccounts(accessToken);

  if (assigned) {
    const info = await igTokenInfo(accessToken);
    const missing = missingScopes(UNIFIED_REQUIRED_SCOPES, info.scopes);
    if (missing.length) {
      console.error(`[inbox-oauth] instagram (unified): faltan permisos ${missing.join(",")}`);
      return { ok: false, error: "missing_scopes" };
    }
    const ig = assigned.find((a) => a.id === o.account.external_id);
    if (!ig) {
      console.error(`[inbox-oauth] instagram (unified): ninguna de las ${assigned.length} cuentas compartidas es la conectada en Cuentas`);
      return { ok: false, error: "no_matching_account" };
    }
    const comments = info.scopes.includes(FB_SCOPE_COMMENTS);
    if (!comments) console.error(`[inbox-oauth] instagram (unified): sin ${FB_SCOPE_COMMENTS} → comentarios desactivados`);
    // Webhook: en modo desarrollo Meta no envía avisos (la Bandeja sondea cada 30 min), así que un fallo aquí no
    // bloquea la conexión. Si el panel no tiene marcado «comments», se reintenta solo con «messages».
    const fields = webhookFields(info.scopes);
    let webhook = "1";
    try {
      await igSubscribeAccount(ig.id, accessToken, fields);
    } catch (e) {
      if (e instanceof InboxError && e.code === "token_expired") throw e;
      try {
        if (fields.length > 1) await igSubscribeAccount(ig.id, accessToken, ["messages"]);
        else throw e;
      } catch {
        webhook = "0";
        console.error("[inbox-oauth] instagram (unified): no se pudo suscribir al webhook; se usará la sincronización periódica");
      }
    }
    const clientBusinessId = await igClientBusinessId(accessToken);
    const expiresAt = info.expiresAt ?? (expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined);
    const metadata: Record<string, string> = { login: IG_UNIFIED_MARK, comments: comments ? "1" : "0", webhook };
    if (clientBusinessId) metadata.client_business_id = clientBusinessId;
    if (process.env.META_INBOX_LOGIN_CONFIG_ID) metadata.config_id = process.env.META_INBOX_LOGIN_CONFIG_ID.slice(0, 40);
    const connectionId = await upsertConnection({
      ...o,
      channel: "instagram",
      externalId: ig.id,
      displayName: ig.username ? `@${ig.username}` : o.account.handle ? `@${o.account.handle}` : null,
      socialAccountId: o.account.id,
      grantedScopes: info.scopes,
      metadata,
      tokens: { accessToken, accessExpiresAt: expiresAt ?? undefined },
    });
    return { ok: true, connectionId };
  }

  // Facebook Login clásico (con página de Facebook).
  const t = await igLongLived(accessToken);
  const missing = missingScopes(LEGACY_REQUIRED_SCOPES, t.grantedScopes);
  if (missing.length) {
    console.error(`[inbox-oauth] instagram (facebook login): faltan permisos ${missing.join(",")}`);
    return { ok: false, error: "missing_scopes" };
  }
  const pages = await igPages(t.accessToken);
  const page = pages.find((p) => p.igId === o.account.external_id);
  // No revocamos permisos aquí: es la misma app de Meta que usa el módulo de publicación.
  if (!page) {
    console.error(`[inbox-oauth] instagram (facebook login): ninguna de las ${pages.length} páginas autorizadas tiene vinculada esa cuenta de Instagram`);
    return { ok: false, error: "no_matching_account" };
  }
  await igSubscribePage(page.pageId, page.pageToken);
  // Guardamos SOLO el token de la página (no caduca si procede de un token de usuario de larga duración).
  const connectionId = await upsertConnection({
    ...o,
    channel: "instagram",
    externalId: page.igId,
    displayName: page.username ? `@${page.username}` : o.account.handle ? `@${o.account.handle}` : page.name,
    socialAccountId: o.account.id,
    grantedScopes: t.grantedScopes,
    metadata: { page_id: page.pageId },
    tokens: { accessToken: page.pageToken },
  });
  return { ok: true, connectionId };
}
