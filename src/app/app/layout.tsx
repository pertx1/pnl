import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "App" };

export default async function AppRootLayout({ children }: LayoutProps<"/app">) {
  await requireUser();
  // Si el usuario tiene 2FA activada, exige haber verificado el código en esta sesión.
  const supabase = await createClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/login/mfa");
  return children;
}
