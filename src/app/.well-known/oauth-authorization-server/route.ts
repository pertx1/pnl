import { NextResponse } from "next/server";
import { authorizationServerMetadata, CORS_HEADERS } from "@/lib/mcp/oauth-server";

/** RFC 8414 · Metadatos del servidor de autorización de Kreo (emisor = la propia app). */
export function GET() {
  return NextResponse.json(authorizationServerMetadata(), { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=300" } });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
