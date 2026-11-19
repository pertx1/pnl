import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Confirmación de la lista de espera (doble opt-in). */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const invalid = new URL("/waitlist/invalid", request.url);
  if (!/^[0-9a-f]{48}$/.test(token)) return NextResponse.redirect(invalid);

  const admin = createAdminClient();
  if (!admin) return NextResponse.redirect(invalid);

  const { data: code, error } = await admin.rpc("waitlist_confirm", { p_token: token });
  if (error || !code) return NextResponse.redirect(invalid);
  return NextResponse.redirect(new URL(`/waitlist/${code}`, request.url));
}
