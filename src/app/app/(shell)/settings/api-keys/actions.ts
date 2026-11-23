"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateApiKey } from "@/lib/mcp/keys";
import { createClient } from "@/lib/supabase/server";

export type ApiKeyResult = { ok: true; key?: string } | { ok?: false; error: string };

/** Crea una API key personal. La clave completa se devuelve UNA sola vez; en BD solo queda su hash SHA-256. */
export async function createApiKey(name: string): Promise<ApiKeyResult> {
  const parsed = z.string().trim().min(1).max(60).safeParse(name);
  if (!parsed.success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { key, prefix, hash } = generateApiKey();
  const { error } = await supabase.rpc("create_mcp_api_key", { p_name: parsed.data, p_prefix: prefix, p_hash: hash });
  if (error) return { error: error.message.includes("too_many_keys") ? "too_many_keys" : "forbidden" };
  revalidatePath("/app/settings/api-keys");
  return { ok: true, key };
}

export async function revokeApiKey(id: string): Promise<ApiKeyResult> {
  if (!z.uuid().safeParse(id).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_mcp_api_key", { p_id: id });
  if (error) return { error: "forbidden" };
  revalidatePath("/app/settings/api-keys");
  return { ok: true };
}

/** Revoca una app conectada por OAuth (Claude, etc.): corta al momento sus tokens de acceso y de refresco. */
export async function revokeConnectedApp(id: string): Promise<ApiKeyResult> {
  if (!z.uuid().safeParse(id).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_mcp_oauth_grant", { p_id: id });
  if (error) return { error: "forbidden" };
  revalidatePath("/app/settings/api-keys");
  return { ok: true };
}

/** Interruptor «permitir gastar créditos» y tope diario de una app conectada o API key propia. */
export async function setCreditPolicy(kind: "oauth" | "api_key", id: string, allow: boolean, cap: number): Promise<ApiKeyResult> {
  const parsed = z
    .object({ kind: z.enum(["oauth", "api_key"]), id: z.uuid(), allow: z.boolean(), cap: z.number().int().min(0).max(100000) })
    .safeParse({ kind, id, allow, cap });
  if (!parsed.success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_mcp_credit_policy", { p_kind: parsed.data.kind, p_id: parsed.data.id, p_allow: parsed.data.allow, p_cap: parsed.data.cap });
  if (error) return { error: "forbidden" };
  revalidatePath("/app/settings/api-keys");
  return { ok: true };
}
