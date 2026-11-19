import { z } from "zod";

/**
 * Esquemas compartidos (cliente/servidor) del módulo de estrategia.
 * El contenido de la estrategia se guarda en JSONB; aquí se valida SIEMPRE antes de escribir.
 */
export const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Coste en créditos de cada acción de IA del módulo (se muestra siempre ANTES). */
export const CREDITS = {
  strategy: 3, // Estratega: estrategia + roadmap completos
  planner: 2, // Planificador: textos de los borradores de 2 semanas
  coach: 2, // Coach: personalizar / ajustar un plan de calentamiento
} as const;

const id = z.string().min(1).max(64);
const shortText = (max: number) => z.string().trim().max(max);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const pillarSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  description: shortText(500),
  examples: z.array(z.string().trim().min(1).max(200)).max(8),
  share: z.number().int().min(0).max(100),
});
export type Pillar = z.infer<typeof pillarSchema>;

export const frequencySchema = z.object({
  platform: z.enum(PLATFORMS),
  postsPerWeek: z.number().int().min(0).max(21),
  /** Hora local preferida (0–23) para los borradores del planificador. */
  hour: z.number().int().min(0).max(23),
});
export type Frequency = z.infer<typeof frequencySchema>;

export const objectiveSchema = z.object({
  id,
  objective: z.string().trim().min(1).max(200),
  kpi: shortText(120),
  target: shortText(60),
  deadline: isoDate.nullable(),
});
export type Objective = z.infer<typeof objectiveSchema>;

export const TASK_STATUSES = ["todo", "doing", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const taskSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
  brief: shortText(2000),
  platform: z.enum(PLATFORMS).nullable(),
  status: z.enum(TASK_STATUSES),
  assigneeId: z.uuid().nullable(),
  dueDate: isoDate.nullable(),
  postId: z.uuid().nullable(),
});
export type RoadmapTask = z.infer<typeof taskSchema>;

export const milestoneSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(160),
  description: shortText(1000),
  dueDate: isoDate.nullable(),
  tasks: z.array(taskSchema).max(40),
});
export type Milestone = z.infer<typeof milestoneSchema>;

export const strategyDocSchema = z.object({
  title: shortText(120),
  summary: shortText(2000),
  audience: shortText(2000),
  pillars: z.array(pillarSchema).max(12),
  frequency: z.array(frequencySchema).max(6),
  objectives: z.array(objectiveSchema).max(20),
  milestones: z.array(milestoneSchema).max(20),
});
export type StrategyDoc = z.infer<typeof strategyDocSchema>;

/** Lectura tolerante del JSONB guardado (si algo no encaja, se descarta en vez de romper la página). */
export function parseJsonArray<T>(value: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const v of value) {
    const r = schema.safeParse(v);
    if (r.success) out.push(r.data);
  }
  return out;
}

export const WARMUP_CATEGORIES = ["profile", "content", "engage", "safety", "learn"] as const;
export type WarmupCategory = (typeof WARMUP_CATEGORIES)[number];

export const WARMUP_ISSUES = ["zero_views", "low_reach", "low_engagement", "restricted", "no_ideas", "no_time"] as const;
export type WarmupIssue = (typeof WARMUP_ISSUES)[number];

export type WarmupTaskDraft = {
  day: number;
  category: WarmupCategory;
  title: string;
  detail: string;
  targetCount: number | null;
};
