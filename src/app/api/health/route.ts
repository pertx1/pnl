import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Comprobación de salud: región donde se ejecutan las funciones (debe ser fra1, junto a Supabase). Sin datos sensibles. */
export function GET() {
  return NextResponse.json({ ok: true, region: process.env.VERCEL_REGION ?? "local" }, { headers: { "Cache-Control": "no-store" } });
}
