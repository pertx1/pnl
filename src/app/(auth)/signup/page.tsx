import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignupForm } from "./signup-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signup") };
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  // Código de afiliado declarado en la URL (?ref=). Sin cookie: solo viaja con el formulario.
  const code = typeof ref === "string" && /^[A-Za-z0-9]{6,16}$/.test(ref) ? ref.toUpperCase() : undefined;
  return <SignupForm referral={code} />;
}
