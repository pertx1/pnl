import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { mfaPending, requireUser } from "@/lib/server/dal";

export const metadata: Metadata = { title: "App" };

export default async function AppRootLayout({ children }: LayoutProps<"/app">) {
  await requireUser();
  // Si el usuario tiene 2FA activada, exige haber verificado el código en esta sesión.
  if (await mfaPending()) redirect("/login/mfa");
  return children;
}
