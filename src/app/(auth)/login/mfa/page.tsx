import { safeNext } from "@/lib/auth/safe-next";
import { MfaForm } from "./mfa-form";

export default async function MfaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <MfaForm next={safeNext(typeof sp.next === "string" ? sp.next : undefined)} />;
}
