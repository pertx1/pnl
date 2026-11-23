import { NextResponse } from "next/server";
import { CORS_HEADERS, protectedResourceMetadata } from "@/lib/mcp/oauth-server";

/** RFC 9728 · Metadatos del recurso protegido (el servidor MCP de Kreo). También en /.well-known/oauth-protected-resource/api/mcp. */
export function GET() {
  return NextResponse.json(protectedResourceMetadata(), { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=300" } });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
