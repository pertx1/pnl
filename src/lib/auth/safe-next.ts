/**
 * Destino tras iniciar sesión / verificar 2FA. Solo rutas internas conocidas (evita open redirects):
 * cualquier ruta bajo /app, o la pantalla de consentimiento OAuth del conector MCP.
 */
export function safeNext(next: string | undefined | null): string {
  if (!next || next.startsWith("//") || next.includes("\\")) return "/app";
  if (next === "/app" || next.startsWith("/app/") || next.startsWith("/app?") || next.startsWith("/app#")) return next;
  if (next === "/oauth/consent") return next;
  return "/app";
}
