// Tipos de las tablas y funciones del módulo "templates" (plantillas, series y textos guardados).
// Migración: supabase/migrations/20261124110000_templates.sql. Se combinan en ../database.types.ts.
import type { Json } from "../database.types";

export type SnippetKind = "hashtags" | "text";

export type TemplatesTables = {
  post_templates: {
    Row: {
      id: string;
      workspace_id: string;
      project_id: string;
      name: string;
      title: string | null;
      caption: string;
      hashtags: string[];
      social_account_ids: string[];
      platform_options: Json;
      preferred_time: string | null;
      created_by: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      workspace_id: string;
      project_id: string;
      name: string;
      title?: string | null;
      caption?: string;
      hashtags?: string[];
      social_account_ids?: string[];
      platform_options?: Json;
      preferred_time?: string | null;
      created_by: string;
    };
    Update: {
      name?: string;
      title?: string | null;
      caption?: string;
      hashtags?: string[];
      social_account_ids?: string[];
      platform_options?: Json;
      preferred_time?: string | null;
    };
    Relationships: [];
  };
  post_snippets: {
    Row: { id: string; workspace_id: string; project_id: string; kind: SnippetKind; name: string; content: string; created_by: string | null; created_at: string; updated_at: string };
    Insert: { id?: string; workspace_id: string; project_id: string; kind: SnippetKind; name: string; content: string; created_by: string };
    Update: { kind?: SnippetKind; name?: string; content?: string };
    Relationships: [];
  };
  post_series: {
    Row: { id: string; workspace_id: string; project_id: string; template_id: string | null; name: string; recurrence: Json; timezone: string; created_by: string | null; created_at: string };
    Insert: { id?: string; workspace_id: string; project_id: string; template_id?: string | null; name: string; recurrence: Json; timezone?: string; created_by: string };
    Update: never;
    Relationships: [
      { foreignKeyName: "post_series_template_id_fkey"; columns: ["template_id"]; isOneToOne: false; referencedRelation: "post_templates"; referencedColumns: ["id"] },
    ];
  };
};

export type TemplatesFunctions = {
  submit_posts: { Args: { p_post_ids: string[] }; Returns: number };
};
