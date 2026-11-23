# 🧠 Cerebro de Kreo

La memoria compartida del proyecto. **Cualquier chat de Claude Code abierto en este repositorio la lee al empezar**
(se carga desde `CLAUDE.md`) y **la actualiza al terminar**. Así Oier puede abrir un chat nuevo en cualquier momento
y seguir donde se quedó, sin volver a explicar nada.

## Dos partes, un solo cerebro

- **Kreo (conector de Claude)**: el cerebro principal de Oier. En claude.ai › Ajustes › Conectores › «Añadir conector
  personalizado» con `https://kreo-nine.vercel.app/api/mcp`. Cualquier chat ve el calendario de contenido, los huecos libres,
  las tareas, crea borradores e imágenes/vídeos (todo queda como borrador: Oier aprueba en la app).

- **Notion · «Cerebro de Oier»** (https://app.notion.com/p/421ecd20cb1d818a8eebe6ff7fbaa789): lo personal y del día a día,
  accesible desde **cualquier chat de Claude** con el conector de Notion: Tareas (con Google Calendar), Vídeos, Ideas,
  Decisiones y Diario. Las tareas de Oier sobre Kreo están allí con el prefijo «Kreo ·».
- **Este repositorio · `docs/cerebro/`**: la parte técnica de Kreo (estado del sistema, pendientes de código).

Si un chat de Claude Code tiene el conector de Notion, al terminar una tarea que afecte a Oier actualiza también Notion
(tarea hecha → estado «Done»; nueva tarea suya → Tareas; decisión → Decisiones; resumen → Diario).

## Qué hay en cada archivo

| Archivo | Para qué | Quién escribe |
|---|---|---|
| [`estado.md`](estado.md) | Foto actual: qué funciona, qué no, dónde está todo (URLs e IDs, **nunca secretos**) | Claude, al cambiar algo importante |
| [`pendientes-oier.md`](pendientes-oier.md) | Lo que solo puede hacer Oier (consolas, pagos, decisiones), en orden y con enlaces | Claude añade, Oier tacha |
| [`pendientes-tecnicos.md`](pendientes-tecnicos.md) | Trabajo de código pendiente, por prioridad | Claude |
| [`decisiones.md`](decisiones.md) | Registro de decisiones: fecha, qué se decidió y por qué | Claude, cuando Oier decide algo |
| [`ideas.md`](ideas.md) | Bandeja de ideas de Oier, sin filtrar | Oier (o Claude con `/cerebro`) |
| [`diario.md`](diario.md) | Qué se hizo en cada sesión, en 3-6 líneas | Claude, al terminar cada sesión |

Documentación detallada (no duplicar aquí, enlazar): `docs/roadmap.md`, `docs/developer-accounts.md`,
`docs/compliance.md`, `docs/app-review/`, `docs/brand.md`, `docs/dev-conventions.md`.

## Reglas para Claude (obligatorias)

1. **Al empezar**: lee `estado.md`, `pendientes-oier.md` y las últimas entradas de `diario.md` antes de proponer nada.
2. **Al terminar una tarea** (antes del commit final): actualiza lo que haya cambiado:
   - `estado.md` si cambia qué funciona o dónde está algo;
   - `pendientes-oier.md` / `pendientes-tecnicos.md` (tacha `[x]` lo hecho, añade lo nuevo);
   - `decisiones.md` si Oier decidió algo;
   - una entrada nueva arriba en `diario.md` con la fecha.
3. **Nunca** escribas secretos (claves, tokens, contraseñas) ni datos personales (emails, teléfonos, direcciones).
   Los IDs públicos de apps y proyectos sí se pueden anotar.
4. Escribe corto, en español, con enlaces directos. Si algo ya está en otro doc, enlázalo en vez de copiarlo.
5. Si dos fuentes se contradicen, manda la más reciente comprobada (consola, base de datos, código) y corrige el cerebro.
6. El cerebro vive en git: haz commit de sus cambios junto con el trabajo y súbelo a la rama y a `main`.

## Comandos rápidos (en cualquier chat de Claude Code de este repo)

- `/cerebro <texto>` — guarda una idea, nota o decisión en el sitio correcto del cerebro.
- `/estado` — resumen de dónde estamos y qué toca ahora.
- `/pendientes` — lista de lo que tiene que hacer Oier, por orden.
