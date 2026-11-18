// Tipos de la base de datos. Regenerar tras cada migración (MCP de Supabase o `supabase gen types`).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type WorkspaceRole = "viewer" | "editor" | "admin" | "owner";

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      activity_log: {
        Row: { action: string; actor_id: string | null; created_at: string; entity_id: string | null; entity_type: string | null; id: number; metadata: Json; workspace_id: string };
        Insert: { action: string; actor_id?: string | null; created_at?: string; entity_id?: string | null; entity_type?: string | null; id?: never; metadata?: Json; workspace_id: string };
        Update: { action?: string; actor_id?: string | null; created_at?: string; entity_id?: string | null; entity_type?: string | null; id?: never; metadata?: Json; workspace_id?: string };
        Relationships: [];
      };
      brand_kits: {
        Row: { banned_words: string[]; colors: Json; example_posts: Json; fonts: Json; logo_path: string | null; project_id: string; target_audience: string | null; tone_of_voice: string | null; updated_at: string; workspace_id: string };
        Insert: { banned_words?: string[]; colors?: Json; example_posts?: Json; fonts?: Json; logo_path?: string | null; project_id: string; target_audience?: string | null; tone_of_voice?: string | null; updated_at?: string; workspace_id: string };
        Update: { banned_words?: string[]; colors?: Json; example_posts?: Json; fonts?: Json; logo_path?: string | null; project_id?: string; target_audience?: string | null; tone_of_voice?: string | null; updated_at?: string; workspace_id?: string };
        Relationships: [];
      };
      credit_balances: {
        Row: { balance: number; updated_at: string; workspace_id: string };
        Insert: { balance?: number; updated_at?: string; workspace_id: string };
        Update: { balance?: number; updated_at?: string; workspace_id?: string };
        Relationships: [];
      };
      credit_ledger: {
        Row: { balance_after: number; created_at: string; created_by: string | null; delta: number; id: number; idempotency_key: string | null; reason: string; ref_id: string | null; ref_type: string | null; workspace_id: string };
        Insert: { balance_after: number; created_at?: string; created_by?: string | null; delta: number; id?: never; idempotency_key?: string | null; reason: string; ref_id?: string | null; ref_type?: string | null; workspace_id: string };
        Update: { balance_after?: number; created_at?: string; created_by?: string | null; delta?: number; id?: never; idempotency_key?: string | null; reason?: string; ref_id?: string | null; ref_type?: string | null; workspace_id?: string };
        Relationships: [];
      };
      plans: {
        Row: { created_at: string; id: string; is_public: boolean; max_members: number; max_projects: number; max_social_accounts: number; monthly_credits: number; name: string };
        Insert: { created_at?: string; id: string; is_public?: boolean; max_members: number; max_projects: number; max_social_accounts: number; monthly_credits: number; name: string };
        Update: { created_at?: string; id?: string; is_public?: boolean; max_members?: number; max_projects?: number; max_social_accounts?: number; monthly_credits?: number; name?: string };
        Relationships: [];
      };
      profiles: {
        Row: { avatar_url: string | null; created_at: string; full_name: string | null; id: string; locale: string; marketing_opt_in: boolean; updated_at: string };
        Insert: { avatar_url?: string | null; created_at?: string; full_name?: string | null; id: string; locale?: string; marketing_opt_in?: boolean; updated_at?: string };
        Update: { avatar_url?: string | null; created_at?: string; full_name?: string | null; id?: string; locale?: string; marketing_opt_in?: boolean; updated_at?: string };
        Relationships: [];
      };
      projects: {
        Row: { archived_at: string | null; created_at: string; created_by: string | null; description: string | null; id: string; name: string; updated_at: string; workspace_id: string };
        Insert: { archived_at?: string | null; created_at?: string; created_by?: string | null; description?: string | null; id?: string; name: string; updated_at?: string; workspace_id: string };
        Update: { archived_at?: string | null; created_at?: string; created_by?: string | null; description?: string | null; id?: string; name?: string; updated_at?: string; workspace_id?: string };
        Relationships: [
          { foreignKeyName: "projects_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] },
        ];
      };
      workspace_members: {
        Row: { created_at: string; role: WorkspaceRole; user_id: string; workspace_id: string };
        Insert: { created_at?: string; role?: WorkspaceRole; user_id: string; workspace_id: string };
        Update: { created_at?: string; role?: WorkspaceRole; user_id?: string; workspace_id?: string };
        Relationships: [
          { foreignKeyName: "workspace_members_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] },
        ];
      };
      workspaces: {
        Row: { created_at: string; created_by: string | null; id: string; name: string; plan_id: string; updated_at: string };
        Insert: { created_at?: string; created_by?: string | null; id?: string; name: string; plan_id?: string; updated_at?: string };
        Update: { created_at?: string; created_by?: string | null; id?: string; name?: string; plan_id?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: "workspaces_plan_id_fkey"; columns: ["plan_id"]; isOneToOne: false; referencedRelation: "plans"; referencedColumns: ["id"] },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      consume_credits: {
        Args: { p_amount: number; p_idempotency_key: string; p_reason: string; p_ref_id?: string; p_ref_type?: string; p_workspace_id: string };
        Returns: number;
      };
      create_project: { Args: { p_description?: string; p_name: string; p_workspace_id: string }; Returns: string };
      create_workspace: { Args: { p_name: string }; Returns: string };
      grant_credits: {
        Args: { p_amount: number; p_idempotency_key: string; p_reason: string; p_ref_id?: string; p_ref_type?: string; p_workspace_id: string };
        Returns: number;
      };
      has_workspace_role: { Args: { p_min_role: WorkspaceRole; p_workspace_id: string }; Returns: boolean };
      shares_workspace_with: { Args: { p_user_id: string }; Returns: boolean };
      workspace_role_of: { Args: { p_workspace_id: string }; Returns: WorkspaceRole };
    };
    Enums: { workspace_role: WorkspaceRole };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type WorkspaceRoleT = WorkspaceRole;
