/**
 * Agentes de IA de Kreo (prompts versionados). Todos usan el brand kit como contexto y respetan la sección 0:
 * nunca publican ni envían nada; devuelven borradores para aprobación humana.
 *
 * Estado:
 *  - Guionista ............ activo (captions y variaciones)          → ./guionista.ts
 *  - Estratega ............ Fase 2 (estrategia y roadmap)
 *  - Analista competencia . Fase 2
 *  - Cazador de productos . Fase 2
 *  - Planificador ......... Fase 2 (rellena el calendario respetando límites anti-baneo)
 *  - Coach calentamiento .. Fase 2 (checklist manual, nunca automatiza)
 *  - Community manager .... Fase 3 (borradores de respuesta a DMs/emails)
 */
export { captionVariations, suggestCaptions, GUIONISTA_VERSION } from "./guionista";
export { isAgentsConfigured, AgentRefusalError } from "./client";
