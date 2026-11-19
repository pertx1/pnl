import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Cliente con la clave SECRETA (salta RLS). Úsalo SOLO para operaciones de sistema que no pertenecen
 * a un usuario concreto: lista de espera, webhooks de Stripe, tareas programadas.
 * Nunca para leer/escribir datos de un usuario en su nombre: para eso usa `@/lib/supabase/server`.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
