"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { appUrl } from "@/lib/env";
import { keep, toErrorKey, type ActionState } from "@/lib/server/errors";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

/** Solo redirecciones internas (evita open redirects). */
function safeNext(next: string | undefined) {
  return next && next.startsWith("/app") && !next.startsWith("//") ? next : "/app";
}

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = keep(formData, ["email"]);
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid_input", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: toErrorKey(error), values };
  redirect(safeNext(parsed.data.next));
}

const signupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  password: z.string().min(10).max(200),
  terms: z.literal("on"),
  ref: z.string().regex(/^[A-Z0-9]{6,16}$/).optional().catch(undefined),
});

export async function signup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = keep(formData, ["name", "email"]);
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid_input", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  const supabase = await createClient();
  const locale = await getLocale();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${appUrl()}/auth/callback?next=/app`,
      // El consentimiento de marketing se pedirá aparte con doble opt-in cuando tengamos proveedor de email.
      data: { full_name: parsed.data.name, locale, terms_accepted_at: new Date().toISOString(), ...(parsed.data.ref ? { ref: parsed.data.ref } : {}) },
    },
  });
  if (error) return { error: toErrorKey(error), values };

  // Si la confirmación de email está activada no hay sesión todavía.
  if (!data.session) return { ok: true, message: parsed.data.email };
  redirect("/app");
}

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = keep(formData, ["email"]);
  const parsed = z.object({ email: z.email().max(254) }).safeParse(values);
  if (!parsed.success) return { error: "invalid_input", values };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl()}/auth/callback?next=/app/settings%23security`,
  });
  // Misma respuesta exista o no la cuenta (no revelamos qué emails están registrados), salvo límite de envíos.
  if (error && toErrorKey(error) === "rate_limited") return { error: "rate_limited", values };
  return { ok: true, message: parsed.data.email };
}
