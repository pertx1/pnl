/** Bloque de contexto de marca común a todos los agentes. */
export type BrandContext = { projectName: string; tone: string; audience: string; bannedWords: string[]; colors: string[] };

export function brandBlock(b: BrandContext) {
  return [
    `<brand name="${b.projectName.replace(/"/g, "'")}">`,
    b.tone ? `Tono de voz: ${b.tone}` : "Tono de voz: no definido (usa un tono cercano y claro).",
    b.audience ? `Público objetivo: ${b.audience}` : "",
    b.bannedWords.length ? `Palabras prohibidas (no las uses nunca): ${b.bannedWords.join(", ")}` : "",
    "</brand>",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Reglas comunes (sección 0 del brief) que todos los agentes deben respetar. */
export const COMMON_RULES = `Reglas obligatorias:
- Lo que generas es una PROPUESTA que una persona revisará y aprobará. No afirmes que algo se ha publicado o enviado.
- No prometas resultados (viralidad, ventas, seguidores). No inventes datos, cifras ni testimonios.
- No sugieras automatizar likes, follows, comentarios, mensajes masivos ni nada que imite actividad humana.
- Respeta las normas de las plataformas y la publicidad: si hay colaboración pagada, indica que debe marcarse como publicidad.
- Escribe en el idioma que se te pida.`;
