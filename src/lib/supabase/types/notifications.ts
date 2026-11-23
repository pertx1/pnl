// Tipos de las tablas y funciones del centro de avisos. Se combinan en ../database.types.ts.
// Migración: supabase/migrations/20261124120000_notifications.sql
import type { Json } from "../database.types";

export type NotificationsTables = {
  notifications: {
    Row: {
      body: string;
      created_at: string;
      data: Json;
      dedupe_key: string | null;
      id: string;
      link: string | null;
      project_id: string | null;
      read_at: string | null;
      title: string;
      type: string;
      user_id: string;
      workspace_id: string;
    };
    Insert: {
      body?: string;
      created_at?: string;
      data?: Json;
      dedupe_key?: string | null;
      id?: string;
      link?: string | null;
      project_id?: string | null;
      read_at?: string | null;
      title: string;
      type: string;
      user_id: string;
      workspace_id: string;
    };
    Update: {
      body?: string;
      created_at?: string;
      data?: Json;
      dedupe_key?: string | null;
      id?: string;
      link?: string | null;
      project_id?: string | null;
      read_at?: string | null;
      title?: string;
      type?: string;
      user_id?: string;
      workspace_id?: string;
    };
    Relationships: [
      { foreignKeyName: "notifications_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] },
      { foreignKeyName: "notifications_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
    ];
  };
  notification_preferences: {
    Row: { disabled_types: string[]; updated_at: string; user_id: string };
    Insert: { disabled_types?: string[]; updated_at?: string; user_id: string };
    Update: { disabled_types?: string[]; updated_at?: string; user_id?: string };
    Relationships: [];
  };
};

export type NotificationsFunctions = {
  notification_types: { Args: Record<string, never>; Returns: string[] };
  mark_notifications_read: { Args: { p_ids?: string[] | null }; Returns: number };
  notify_user: {
    Args: {
      p_user_id: string;
      p_workspace_id: string;
      p_project_id: string | null;
      p_type: string;
      p_title: string;
      p_body?: string;
      p_link?: string | null;
      p_data?: Json;
      p_dedupe_key?: string | null;
      p_id?: string | null;
    };
    Returns: string | null;
  };
};
