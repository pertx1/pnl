@AGENTS.md

# 🧠 Cerebro del proyecto

Memoria compartida entre todos los chats: `docs/cerebro/`. **Léela al empezar y actualízala al terminar**
(reglas en `docs/cerebro/README.md`). Estado actual:

@docs/cerebro/estado.md

@docs/cerebro/pendientes-oier.md

# Reglas del proyecto

- Habla con Oier siempre en español. Explica decisiones importantes en pocas líneas.
- Pregunta antes de cualquier decisión que cueste dinero o sea difícil de deshacer.
- **Regla nº 1**: 100 % legal y sin baneos. Solo APIs oficiales + OAuth oficial; nada de scraping con login,
  APIs no oficiales ni automatización de engagement. La IA propone, el usuario aprueba. Ver `docs/compliance.md`.
- Cada módulo pasa por el subagente `seguridad-legal` antes de cerrarse (nota en `docs/compliance.md`).
- Antes de cada merge: `qa-tester` (Vitest + Playwright).
- Commits pequeños y descriptivos. Claves solo en `.env.local`; documentar en `.env.example`.
- Al terminar cada tarea: actualiza `docs/cerebro/` (estado, pendientes, decisiones y una entrada en el diario).
- Plan por fases en `docs/roadmap.md`. Cuentas y revisiones de APIs en `docs/developer-accounts.md`.
- Next.js 16: lee `node_modules/next/dist/docs/` antes de usar APIs que no conozcas.
