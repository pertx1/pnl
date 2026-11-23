import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Todo menos estáticos, imágenes e iconos, y los endpoints máquina a máquina (MCP y OAuth sin cookies).
    "/((?!api/inngest|api/stripe|api/mcp|\\.well-known|oauth/token|oauth/register|oauth/revoke|_next/static|_next/image|favicon.ico|icon.svg|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
