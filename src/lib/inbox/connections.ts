import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { InboxChannel } from "@/lib/supabase/types/inbox";
import { InboxError } from "./config";
import { gmailRevoke } from "./providers/gmail";
import { isInstagramLogin } from "@/lib/social/instagram-login";
import { igUnsubscribePage } from "./providers/instagram";
import { igLoginUnsubscribe } from "./providers/instagram-login";
import { loadInboxTokens, saveInboxTokens } from "./tokens";
import type { InboxTokenSet } from "./types";

function admin() {
  const a = createAdminClient();
  if (!a) throw new InboxError("not_configured");
  return a;
}

/**
 * Alta o reconexión de un buzón/cuenta. Llamar SOLO tras comprobar con la sesión del usuario que es editor del proyecto.
 */
export async function upsertConnection(o: {
  workspaceId: string;
  projectId: string;
  channel: InboxChannel;
  externalId: string;
  displayName: string | null;
  socialAccountId?: string | null;
  grantedScopes: string[];
  metadata?: Record<string, string>;
  userId: string;
  tokens: Pick<InboxTokenSet, "accessToken" | "refreshToken" | "accessExpiresAt">;
}) {
  const { data, error } = await admin()
    .from("inbox_connections")
    .upsert(
      {
        workspace_id: o.workspaceId,
        project_id: o.projectId,
        channel: o.channel,
        external_id: o.externalId.slice(0, 320),
        display_name: o.displayName?.slice(0, 200) ?? null,
        social_account_id: o.socialAccountId ?? null,
        status: "active",
        granted_scopes: o.grantedScopes,
        metadata: (o.metadata ?? {}) as Json,
        connected_by: o.userId,
      },
      { onConflict: "project_id,channel,external_id" },
    )
    .select("id")
    .single();
  if (error || !data) throw new InboxError("db_error");
  await saveInboxTokens(data.id, o.tokens);
  return data.id;
}

/**
 * Desconecta: revoca/da de baja en el proveedor cuando es posible y borra la conexión (en cascada: tokens, hilos,
 * mensajes y borradores). Llamar SOLO tras comprobar que el usuario es admin del workspace.
 */
export async function disconnectConnection(connectionId: string) {
  const db = admin();
  const { data: conn } = await db.from("inbox_connections").select("id, channel, external_id, metadata").eq("id", connectionId).maybeSingle();
  if (!conn) return;
  const tokens = await loadInboxTokens(conn.id).catch(() => null);
  if (tokens) {
    if (conn.channel === "gmail") {
      await gmailRevoke(tokens.refreshToken ?? tokens.accessToken);
    } else if (conn.channel === "instagram") {
      // Solo damos de baja el webhook si ningún otro proyecto usa esa misma cuenta en su bandeja.
      const pageId = String((conn.metadata as { page_id?: string } | null)?.page_id ?? "");
      const { count } = await db.from("inbox_connections").select("id", { count: "exact", head: true }).eq("channel", "instagram").eq("external_id", conn.external_id).neq("id", conn.id);
      if (!count && isInstagramLogin(conn.metadata)) await igLoginUnsubscribe(conn.external_id, tokens.accessToken);
      else if (pageId && !count) await igUnsubscribePage(pageId, tokens.accessToken);
    }
    // Microsoft no ofrece revocación de un refresh token delegado concreto: lo borramos y la UI indica dónde retirar el permiso.
  }
  await db.from("inbox_connections").delete().eq("id", conn.id);
}
