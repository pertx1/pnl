import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function unsubscribe(token: string) {
  if (!/^[0-9a-f]{48}$/.test(token)) return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin.rpc("waitlist_unsubscribe", { p_token: token });
}

/** Baja en un clic desde el enlace del email. */
export async function GET(request: NextRequest) {
  await unsubscribe(request.nextUrl.searchParams.get("token") ?? "");
  return NextResponse.redirect(new URL("/waitlist/unsubscribed", request.url));
}

/** Baja en un clic desde el cliente de correo (List-Unsubscribe-Post, RFC 8058). */
export async function POST(request: NextRequest) {
  await unsubscribe(request.nextUrl.searchParams.get("token") ?? "");
  return new NextResponse(null, { status: 200 });
}
