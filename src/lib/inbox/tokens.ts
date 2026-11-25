import "server-only";
import { decryptToken, encryptToken } from "@/lib/crypto/tokens";
import { notifyInboxIssue } from "@/lib/notifications/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { igLoginRefresh } from "@/lib/social/platforms/instagram";
import { igRefreshDue, isInstagramLogin } from "@/lib/social/instagram-login";
import { PlatformError } from "@/lib/social/types";
import { InboxError } from "./config";
import { gmailRefresh } from "./providers/gmail";
import { outlookRefresh } from "./providers/outlook";
import type { InboxTokenSet } from "./types";

/**
 * Tokens de la bandeja cifrados (AES-256-GCM) en `inbox_connection_tokens` (sin políticas RLS → solo service_role).
 * Llamar SIEMPRE después de comprobar los permisos del usuario con su propia sesión.
 */
function admin() {
  const a = createAdminClient();
  if (!a) throw new InboxError("not_configured");
  return a;
}

export async function saveInboxTokens(connectionId: string, t: Pick<InboxTokenSet, "accessToken" | "refreshToken" | "accessExpiresAt">) {
  const { error } = await admin()
    .from("inbox_connection_tokens")
    .upsert({
      connection_id: connectionId,
      access_token_enc: encryptToken(t.accessToken),
      refresh_token_enc: t.refreshToken ? encryptToken(t.refreshToken) : null,
      access_expires_at: t.accessExpiresAt?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new InboxError("db_error");
}

export async function loadInboxTokens(connectionId: string) {
  const { data } = await admin().from("inbox_connection_tokens").select("*").eq("connection_id", connectionId).maybeSingle();
  if (!data) return null;
  return {
    accessToken: decryptToken(data.access_token_enc),
    refreshToken: data.refresh_token_enc ? decryptToken(data.refresh_token_enc) : undefined,
    accessExpiresAt: data.access_expires_at ? new Date(data.access_expires_at) : undefined,
  };
}

/**
 * Token de acceso vigente; refresca si caduca en < 2 min. Si no se puede, marca la conexión como caducada.
 * Instagram: con Facebook Login se guarda el token de página (no caduca) o, con Unified Login, el token BISU (su caducidad
 * depende de la configuración de Meta; si caduca, hay que reconectar); con Instagram Login, el token de usuario de
 * Instagram (60 días), que se refresca cuando quedan < 10 días (igRefreshDue) — también desde la tarea diaria.
 */
export async function freshAccessToken(conn: { id: string; channel: string; metadata?: unknown }): Promise<string> {
  const t = await loadInboxTokens(conn.id);
  if (!t) throw new InboxError("missing_tokens");
  const expired = t.accessExpiresAt && t.accessExpiresAt.getTime() <= Date.now();
  if (conn.channel === "instagram") {
    if (!isInstagramLogin(conn.metadata)) {
      // Token de página (no caduca) o token BISU de Unified Login (caduca o no según la configuración de Meta).
      if (expired) {
        await markExpired(conn.id);
        throw new InboxError("token_expired");
      }
      return t.accessToken;
    }
    if (expired) {
      await markExpired(conn.id);
      throw new InboxError("token_expired");
    }
    if (igRefreshDue(t.accessExpiresAt)) {
      try {
        const r = await igLoginRefresh(t.accessToken);
        await saveInboxTokens(conn.id, { accessToken: r.accessToken, accessExpiresAt: r.accessExpiresAt });
        return r.accessToken;
      } catch (e) {
        // El token sigue vigente: se usa y se reintenta en la siguiente pasada. Solo el código (nunca el token).
        console.error(`[inbox] refresco anticipado de instagram falló: ${e instanceof PlatformError ? e.code : "unknown"}`);
      }
    }
    return t.accessToken;
  }
  const soon = t.accessExpiresAt && t.accessExpiresAt.getTime() < Date.now() + 2 * 60_000;
  if (!soon) return t.accessToken;
  if (!t.refreshToken) {
    await markExpired(conn.id);
    throw new InboxError("token_expired");
  }
  try {
    const r = conn.channel === "gmail" ? await gmailRefresh(t.refreshToken) : await outlookRefresh(t.refreshToken);
    // Microsoft rota el refresh token: guardamos el nuevo si llega.
    await saveInboxTokens(conn.id, { accessToken: r.accessToken, refreshToken: r.refreshToken ?? t.refreshToken, accessExpiresAt: r.accessExpiresAt });
    return r.accessToken;
  } catch (e) {
    if (e instanceof InboxError && e.code === "token_expired") await markExpired(conn.id);
    throw e;
  }
}

export async function markExpired(connectionId: string) {
  const { data: changed } = await admin().from("inbox_connections").update({ status: "expired" }).eq("id", connectionId).neq("status", "expired").select("id");
  // Aviso solo al pasar a caducada; notifyInboxIssue nunca lanza.
  if (changed?.length) await notifyInboxIssue(admin(), connectionId);
}
