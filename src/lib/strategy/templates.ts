import { addDaysIso } from "./dates";
import type { Frequency, Platform, StrategyDoc } from "./schema";

/**
 * Plantillas de estrategia (funcionan sin IA). Son un punto de partida razonable y 100 % editable.
 * Sin promesas de resultados: los objetivos son metas que el usuario debe ajustar a su realidad.
 */
export const STRATEGY_GOALS = ["audience", "sales", "launch"] as const;
export type StrategyGoal = (typeof STRATEGY_GOALS)[number];
type Locale = "es" | "en";
type L = { es: string; en: string };

const DEFAULT_FREQ: Record<Platform, Omit<Frequency, "platform">> = {
  tiktok: { postsPerWeek: 4, hour: 19 },
  instagram: { postsPerWeek: 3, hour: 13 },
  youtube: { postsPerWeek: 1, hour: 17 },
};

type PillarT = { name: L; description: L; examples: L[]; share: number };
type TaskT = { title: L; brief: L; platform?: Platform; day: number };
type MilestoneT = { title: L; description: L; day: number; tasks: TaskT[] };
type ObjectiveT = { objective: L; kpi: L; target: L; day: number };
type Template = { title: L; summary: L; audience: L; pillars: PillarT[]; objectives: ObjectiveT[]; milestones: MilestoneT[] };

const TEMPLATES: Record<StrategyGoal, Template> = {
  audience: {
    title: { es: "Crecer una audiencia fiel", en: "Grow a loyal audience" },
    summary: {
      es: "Publicar con constancia contenido útil y reconocible en pocos formatos que funcionen, medir cada semana y doblar la apuesta por lo que retiene.",
      en: "Post consistently useful, recognisable content in a few formats that work, measure weekly and double down on what retains viewers.",
    },
    audience: {
      es: "Personas interesadas en tu nicho que buscan aprender o entretenerse en pocos minutos. Define edad, país e idioma principal.",
      en: "People interested in your niche who want to learn or be entertained in a few minutes. Define age, country and main language.",
    },
    pillars: [
      {
        name: { es: "Enseñar", en: "Teach" },
        description: { es: "Trucos y explicaciones cortas que resuelven un problema concreto.", en: "Short tips and explanations that solve one specific problem." },
        examples: [
          { es: "3 errores que cometes al empezar en…", en: "3 mistakes you make when starting…" },
          { es: "Cómo hacer X en 30 segundos", en: "How to do X in 30 seconds" },
        ],
        share: 40,
      },
      {
        name: { es: "Detrás de cámaras", en: "Behind the scenes" },
        description: { es: "Proceso, día a día y decisiones reales: genera confianza.", en: "Process, day-to-day and real decisions: builds trust." },
        examples: [
          { es: "Un día preparando…", en: "A day preparing…" },
          { es: "Lo que nadie ve de…", en: "What nobody sees about…" },
        ],
        share: 25,
      },
      {
        name: { es: "Opinión y tendencias", en: "Opinion and trends" },
        description: { es: "Tu punto de vista sobre novedades del nicho (con contenido original).", en: "Your take on niche news (with original content)." },
        examples: [{ es: "Mi opinión sincera sobre…", en: "My honest take on…" }],
        share: 20,
      },
      {
        name: { es: "Comunidad", en: "Community" },
        description: { es: "Responder preguntas y comentarios en vídeo, encuestas.", en: "Answer questions and comments on video, polls." },
        examples: [{ es: "Respondo a vuestra pregunta sobre…", en: "Answering your question about…" }],
        share: 15,
      },
    ],
    objectives: [
      { objective: { es: "Publicar con constancia", en: "Post consistently" }, kpi: { es: "Publicaciones por semana", en: "Posts per week" }, target: { es: "≥ 4", en: "≥ 4" }, day: 28 },
      { objective: { es: "Mejorar la retención", en: "Improve retention" }, kpi: { es: "% de visualización media", en: "Average watch %" }, target: { es: "+10 % vs. mes 1", en: "+10% vs. month 1" }, day: 60 },
      { objective: { es: "Crecer seguidores", en: "Grow followers" }, kpi: { es: "Seguidores netos", en: "Net followers" }, target: { es: "Define tu meta", en: "Set your target" }, day: 90 },
    ],
    milestones: [
      {
        title: { es: "Base lista", en: "Foundations ready" },
        description: { es: "Perfil completo, pilares claros y primeras ideas.", en: "Complete profile, clear pillars and first ideas." },
        day: 7,
        tasks: [
          { title: { es: "Revisar bio, foto y enlace", en: "Review bio, photo and link" }, brief: { es: "Bio con propuesta de valor clara en una frase.", en: "Bio with a one-line value proposition." }, day: 2 },
          { title: { es: "Lista de 20 ideas por pilar", en: "List 20 ideas per pillar" }, brief: { es: "Usa los ejemplos de cada pilar como punto de partida.", en: "Use each pillar's examples as a starting point." }, day: 5 },
        ],
      },
      {
        title: { es: "Primer mes publicando", en: "First month posting" },
        description: { es: "Ritmo constante y primera revisión de métricas.", en: "Steady rhythm and first metrics review." },
        day: 30,
        tasks: [
          { title: { es: "Vídeo: 3 errores al empezar", en: "Video: 3 beginner mistakes" }, brief: { es: "Gancho en el primer segundo. Un error por corte.", en: "Hook in the first second. One mistake per cut." }, platform: "tiktok", day: 10 },
          { title: { es: "Carrusel: guía rápida", en: "Carousel: quick guide" }, brief: { es: "5 diapositivas, una idea por diapositiva, CTA a guardar.", en: "5 slides, one idea each, CTA to save." }, platform: "instagram", day: 14 },
          { title: { es: "Revisión mensual de métricas", en: "Monthly metrics review" }, brief: { es: "Qué 3 publicaciones retuvieron más y por qué.", en: "Which 3 posts retained best and why." }, day: 30 },
        ],
      },
      {
        title: { es: "Formatos ganadores", en: "Winning formats" },
        description: { es: "Repetir y mejorar lo que mejor funciona.", en: "Repeat and improve what works best." },
        day: 90,
        tasks: [
          { title: { es: "Serie de 5 episodios del mejor formato", en: "5-episode series of the best format" }, brief: { es: "Mismo formato, temas distintos.", en: "Same format, different topics." }, day: 45 },
          { title: { es: "Vídeo largo de YouTube", en: "Long YouTube video" }, brief: { es: "Amplía el tema que más preguntas generó.", en: "Expand the topic that drew the most questions." }, platform: "youtube", day: 60 },
        ],
      },
    ],
  },
  sales: {
    title: { es: "Vender un producto con contenido", en: "Sell a product with content" },
    summary: {
      es: "Mostrar el producto resolviendo un problema real, con pruebas honestas y llamadas a la acción claras. Toda colaboración pagada se marca como publicidad.",
      en: "Show the product solving a real problem, with honest demos and clear calls to action. Every paid partnership is labelled as advertising.",
    },
    audience: {
      es: "Personas con el problema que resuelve tu producto. Describe su situación, objeciones y dónde compran.",
      en: "People with the problem your product solves. Describe their situation, objections and where they buy.",
    },
    pillars: [
      {
        name: { es: "Problema → solución", en: "Problem → solution" },
        description: { es: "El problema del cliente y cómo lo resuelve el producto, sin exagerar.", en: "The customer's problem and how the product solves it, without exaggeration." },
        examples: [{ es: "Si te pasa esto, prueba…", en: "If this happens to you, try…" }],
        share: 35,
      },
      {
        name: { es: "Demostración", en: "Demo" },
        description: { es: "Unboxing, uso real, antes/después verificables.", en: "Unboxing, real use, verifiable before/after." },
        examples: [{ es: "Lo uso 7 días: resultado real", en: "I use it for 7 days: real result" }],
        share: 30,
      },
      {
        name: { es: "Prueba social", en: "Social proof" },
        description: { es: "Opiniones reales de clientes (con su permiso). Nunca inventadas.", en: "Real customer reviews (with permission). Never invented." },
        examples: [{ es: "Lo que dicen los clientes de…", en: "What customers say about…" }],
        share: 20,
      },
      {
        name: { es: "Educación", en: "Education" },
        description: { es: "Contenido útil del nicho aunque no vendas nada.", en: "Useful niche content even when not selling." },
        examples: [{ es: "Cómo elegir el mejor…", en: "How to choose the best…" }],
        share: 15,
      },
    ],
    objectives: [
      { objective: { es: "Tráfico a la tienda", en: "Store traffic" }, kpi: { es: "Clics en el enlace", en: "Link clicks" }, target: { es: "Define tu meta", en: "Set your target" }, day: 30 },
      { objective: { es: "Conversión", en: "Conversion" }, kpi: { es: "Pedidos atribuidos a redes", en: "Orders attributed to social" }, target: { es: "Define tu meta", en: "Set your target" }, day: 60 },
      { objective: { es: "Contenido de producto", en: "Product content" }, kpi: { es: "Demos publicadas", en: "Demos published" }, target: { es: "≥ 8", en: "≥ 8" }, day: 30 },
    ],
    milestones: [
      {
        title: { es: "Ficha y mensajes", en: "Listing and messages" },
        description: { es: "Propuesta de valor, objeciones y pruebas listas.", en: "Value proposition, objections and proof ready." },
        day: 7,
        tasks: [
          { title: { es: "Lista de 5 objeciones y respuestas", en: "List 5 objections and answers" }, brief: { es: "Cada objeción será un vídeo.", en: "Each objection becomes a video." }, day: 3 },
          { title: { es: "Grabar material de demo", en: "Record demo footage" }, brief: { es: "Planos de uso real, buena luz, sin música con copyright.", en: "Real-use shots, good light, no copyrighted music." }, day: 6 },
        ],
      },
      {
        title: { es: "Campaña de lanzamiento", en: "Launch campaign" },
        description: { es: "Dos semanas de demos y problema→solución.", en: "Two weeks of demos and problem→solution." },
        day: 21,
        tasks: [
          { title: { es: "Vídeo: el problema que resuelve", en: "Video: the problem it solves" }, brief: { es: "Empieza por el problema, el producto aparece a mitad.", en: "Start with the problem; product appears halfway." }, platform: "tiktok", day: 9 },
          { title: { es: "Reel: demo en 15 s", en: "Reel: 15-second demo" }, brief: { es: "Sin texto exagerado. CTA al enlace de la bio.", en: "No exaggerated claims. CTA to bio link." }, platform: "instagram", day: 12 },
        ],
      },
      {
        title: { es: "Optimizar", en: "Optimise" },
        description: { es: "Quedarse con los ángulos que convierten.", en: "Keep the angles that convert." },
        day: 60,
        tasks: [{ title: { es: "Revisar qué ángulo trajo más clics", en: "Review which angle drove most clicks" }, brief: { es: "Repite el ángulo con 3 variaciones.", en: "Repeat the angle with 3 variations." }, day: 35 }],
      },
    ],
  },
  launch: {
    title: { es: "Lanzar una marca o cuenta nueva", en: "Launch a new brand or account" },
    summary: {
      es: "Calentar la cuenta a mano, definir una identidad reconocible y publicar con frecuencia sana mientras se descubre qué conecta con el público.",
      en: "Warm up the account by hand, define a recognisable identity and post at a healthy frequency while finding what resonates.",
    },
    audience: {
      es: "Primeros seguidores del nicho: curiosos y early adopters. Define a quién quieres atraer primero.",
      en: "First niche followers: curious early adopters. Define who you want to attract first.",
    },
    pillars: [
      {
        name: { es: "Presentación", en: "Introduction" },
        description: { es: "Quién eres, qué harás y por qué seguirte.", en: "Who you are, what you'll do and why follow." },
        examples: [{ es: "Por qué empiezo esta cuenta", en: "Why I'm starting this account" }],
        share: 25,
      },
      {
        name: { es: "Valor del nicho", en: "Niche value" },
        description: { es: "Contenido útil y original del tema principal.", en: "Useful, original content on the main topic." },
        examples: [{ es: "Lo básico de… en 1 minuto", en: "The basics of… in 1 minute" }],
        share: 45,
      },
      {
        name: { es: "Proceso", en: "Process" },
        description: { es: "Documentar el camino desde cero.", en: "Document the journey from zero." },
        examples: [{ es: "Semana 1 de…", en: "Week 1 of…" }],
        share: 30,
      },
    ],
    objectives: [
      { objective: { es: "Calentamiento completado", en: "Warm-up completed" }, kpi: { es: "Días del plan completados", en: "Plan days completed" }, target: { es: "14/14", en: "14/14" }, day: 14 },
      { objective: { es: "Primeras publicaciones", en: "First posts" }, kpi: { es: "Publicaciones", en: "Posts" }, target: { es: "≥ 12", en: "≥ 12" }, day: 45 },
      { objective: { es: "Primeros seguidores", en: "First followers" }, kpi: { es: "Seguidores", en: "Followers" }, target: { es: "Define tu meta", en: "Set your target" }, day: 90 },
    ],
    milestones: [
      {
        title: { es: "Cuenta preparada", en: "Account ready" },
        description: { es: "Plan de calentamiento y perfil completos.", en: "Warm-up plan and profile complete." },
        day: 14,
        tasks: [
          { title: { es: "Crear plan de calentamiento", en: "Create warm-up plan" }, brief: { es: "Sección Calentamiento de Kreo.", en: "Kreo Warm-up section." }, day: 1 },
          { title: { es: "Definir identidad visual", en: "Define visual identity" }, brief: { es: "Colores, tipografía y portada en el brand kit.", en: "Colours, type and cover in the brand kit." }, day: 4 },
        ],
      },
      {
        title: { es: "Primeras 12 publicaciones", en: "First 12 posts" },
        description: { es: "Probar formatos sin forzar la frecuencia.", en: "Test formats without forcing frequency." },
        day: 45,
        tasks: [
          { title: { es: "Vídeo de presentación", en: "Introduction video" }, brief: { es: "Quién eres y qué vas a publicar, en menos de 30 s.", en: "Who you are and what you'll post, under 30 s." }, platform: "tiktok", day: 15 },
          { title: { es: "Post fijado de bienvenida", en: "Pinned welcome post" }, brief: { es: "Explica qué encontrará quien te siga.", en: "Explain what followers will get." }, platform: "instagram", day: 17 },
        ],
      },
      {
        title: { es: "Primer análisis", en: "First analysis" },
        description: { es: "Elegir los 2 formatos con mejor respuesta.", en: "Pick the 2 best-performing formats." },
        day: 60,
        tasks: [{ title: { es: "Revisión de métricas", en: "Metrics review" }, brief: { es: "Retención, guardados y comentarios por formato.", en: "Retention, saves and comments per format." }, day: 60 }],
      },
    ],
  },
};

export function strategyTemplate(goal: StrategyGoal, locale: Locale, startDay: string, platforms: Platform[], newId: () => string): StrategyDoc {
  const t = TEMPLATES[goal];
  const pick = (l: L) => l[locale];
  const plats: Platform[] = platforms.length ? platforms : ["tiktok", "instagram"];
  return {
    title: pick(t.title),
    summary: pick(t.summary),
    audience: pick(t.audience),
    pillars: t.pillars.map((p) => ({ id: newId(), name: pick(p.name), description: pick(p.description), examples: p.examples.map(pick), share: p.share })),
    frequency: plats.map((p) => ({ platform: p, ...DEFAULT_FREQ[p] })),
    objectives: t.objectives.map((o) => ({ id: newId(), objective: pick(o.objective), kpi: pick(o.kpi), target: pick(o.target), deadline: addDaysIso(startDay, o.day) })),
    milestones: t.milestones.map((m) => ({
      id: newId(),
      title: pick(m.title),
      description: pick(m.description),
      dueDate: addDaysIso(startDay, m.day),
      tasks: m.tasks
        // Tareas de redes que el proyecto no usa: fuera (si no, pasarlas al calendario no tendría cuenta destino).
        .filter((task) => !task.platform || plats.includes(task.platform))
        .map((task) => ({
          id: newId(),
          title: pick(task.title),
          brief: pick(task.brief),
          platform: task.platform ?? null,
          status: "todo" as const,
          assigneeId: null,
          dueDate: addDaysIso(startDay, task.day),
          postId: null,
        })),
    })),
  };
}

/** Frecuencia por defecto para una red (al añadirla a mano). */
export function defaultFrequency(platform: Platform): Frequency {
  return { platform, ...DEFAULT_FREQ[platform] };
}
