import type { Metadata } from "next";
import { requireUser } from "@/lib/server/dal";

export const metadata: Metadata = { title: "App" };

export default async function AppRootLayout({ children }: LayoutProps<"/app">) {
  await requireUser();
  return children;
}
