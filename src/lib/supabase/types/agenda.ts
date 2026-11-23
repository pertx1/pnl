// Tipos de «Mi agenda» (bloques de tiempo personales y jornada). Se combinan en ../database.types.ts.
// Migración: supabase/migrations/20261124130000_agenda.sql
export type AgendaBlockKindT = "work" | "study" | "sport" | "personal" | "creation" | "other";
export type AgendaBlockSourceT = "manual" | "plan" | "mcp";

export type AgendaBlockRow = {
  id: string;
  user_id: string;
  title: string;
  kind: AgendaBlockKindT;
  note: string;
  /** Primer día (YYYY-MM-DD, local). */
  start_day: string;
  /** Último día en que puede ocurrir (en los puntuales = start_day; null = recurrente sin fin). */
  end_day: string | null;
  /** Minutos locales desde medianoche (0–1439) y fin (1–1440, > inicio). */
  start_minute: number;
  end_minute: number;
  /** Días ISO (1 = lunes … 7 = domingo). Vacío = puntual. */
  repeat_days: number[];
  skipped_days: string[];
  timezone: string;
  project_id: string | null;
  task_id: string | null;
  post_id: string | null;
  source: AgendaBlockSourceT;
  created_at: string;
  updated_at: string;
};

export type AgendaSettingsRow = { user_id: string; day_start_minute: number; day_end_minute: number; timezone: string; updated_at: string };

export type AgendaTables = {
  agenda_blocks: {
    Row: AgendaBlockRow;
    Insert: Omit<Partial<AgendaBlockRow>, "id" | "created_at" | "updated_at"> &
      Pick<AgendaBlockRow, "title" | "start_day" | "start_minute" | "end_minute"> & { end_day: string | null };
    Update: Partial<Omit<AgendaBlockRow, "id" | "user_id" | "created_at" | "updated_at">>;
    Relationships: [
      { foreignKeyName: "agenda_blocks_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
      { foreignKeyName: "agenda_blocks_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "roadmap_tasks"; referencedColumns: ["id"] },
      { foreignKeyName: "agenda_blocks_post_id_fkey"; columns: ["post_id"]; isOneToOne: false; referencedRelation: "posts"; referencedColumns: ["id"] },
    ];
  };
  agenda_settings: {
    Row: AgendaSettingsRow;
    Insert: Partial<AgendaSettingsRow>;
    Update: Partial<Omit<AgendaSettingsRow, "user_id">>;
    Relationships: [];
  };
};
