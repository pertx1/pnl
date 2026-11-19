import { NextResponse, type NextRequest } from "next/server";
import { isValidInviteToken } from "@/lib/team/roles";

/**
 * Vuelta tras iniciar sesión desde una invitación: /login?next=/app/team/accept/<token> → /invite/<token>.
 * (El login solo acepta `next` bajo /app para evitar redirecciones abiertas.)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = isValidInviteToken(token) ? `/invite/${token}` : "/app";
  return NextResponse.redirect(new URL(target, request.nextUrl.origin));
}
