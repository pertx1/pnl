/** Traduce errores de Supabase/Postgres a claves de i18n (`errors.*`). Nunca devolvemos mensajes crudos al cliente. */
export type ErrorKey =
  | "generic"
  | "invalid_input"
  | "invalid_credentials"
  | "email_not_confirmed"
  | "user_exists"
  | "weak_password"
  | "rate_limited"
  | "forbidden"
  | "plan_limit_projects"
  | "insufficient_credits"
  | "not_found";

const KNOWN: ErrorKey[] = ["forbidden", "plan_limit_projects", "insufficient_credits"];

export function toErrorKey(error: unknown): ErrorKey {
  const e = error as { message?: string; code?: string; status?: number } | null;
  const msg = (e?.message ?? "").toLowerCase();
  const code = e?.code ?? "";
  for (const k of KNOWN) if (msg.includes(k)) return k;
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "invalid_credentials";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) return "email_not_confirmed";
  if (code === "user_already_exists" || msg.includes("already registered")) return "user_exists";
  if (code === "weak_password") return "weak_password";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || e?.status === 429) return "rate_limited";
  if (code === "42501") return "forbidden";
  return "generic";
}

export type ActionState =
  | {
      ok?: boolean;
      error?: ErrorKey;
      fieldErrors?: Record<string, string[] | undefined>;
      message?: string;
      /** Valores no sensibles para repoblar el formulario (React 19 lo resetea tras cada envío). Nunca contraseñas. */
      values?: Record<string, string>;
    }
  | undefined;

export function keep(formData: FormData, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}
