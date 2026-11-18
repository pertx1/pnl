"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  // Si hay sesión, se guarda también en el perfil (para emails en su idioma).
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) await supabase.from("profiles").update({ locale }).eq("id", data.user.id);
}
