import type { CommerceFunctions, CommerceTables } from "./types/commerce";
import type { InboxFunctions, InboxTables } from "./types/inbox";
import type { ResearchFunctions, ResearchTables } from "./types/research";
import type { StrategyFunctions, StrategyTables } from "./types/strategy";
import type { TeamFunctions, TeamTables } from "./types/team";

// Tipos de la base de datos. Regenerar tras cada migración (MCP de Supabase o `supabase gen types`).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type WorkspaceRole = "viewer" | "editor" | "admin" | "owner";
type SocialPlatform = "tiktok" | "instagram" | "youtube";
type ConnectionStatus = "active" | "expired" | "missing_scopes" | "revoked" | "error";
export type PostStatus = "draft" | "pending_approval" | "approved" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";

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
      social_accounts: {
        Row: { id: string; workspace_id: string; project_id: string; platform: SocialPlatform; external_id: string; handle: string | null; display_name: string | null; avatar_url: string | null; status: ConnectionStatus; granted_scopes: string[]; missing_scopes: string[]; daily_post_limit: number; metadata: Json; connected_by: string | null; last_synced_at: string | null; created_at: string; updated_at: string };
        Insert: never;
        Update: { daily_post_limit?: number; status?: ConnectionStatus; last_synced_at?: string | null };
        Relationships: [];
      };
      social_account_tokens: {
        Row: { social_account_id: string; access_token_enc: string; refresh_token_enc: string | null; access_expires_at: string | null; refresh_expires_at: string | null; updated_at: string };
        Insert: { social_account_id: string; access_token_enc: string; refresh_token_enc?: string | null; access_expires_at?: string | null; refresh_expires_at?: string | null; updated_at?: string };
        Update: { access_token_enc?: string; refresh_token_enc?: string | null; access_expires_at?: string | null; refresh_expires_at?: string | null; updated_at?: string };
        Relationships: [];
      };
      posts: {
        Row: { id: string; workspace_id: string; project_id: string; title: string | null; caption: string; asset_ids: string[]; ai_generated: boolean; status: PostStatus; scheduled_at: string | null; created_by: string | null; approved_by: string | null; approved_at: string | null; created_at: string; updated_at: string };
        Insert: { workspace_id: string; project_id: string; title?: string | null; caption?: string; asset_ids?: string[]; ai_generated?: boolean; scheduled_at?: string | null; created_by: string };
        Update: { title?: string | null; caption?: string; asset_ids?: string[]; ai_generated?: boolean; scheduled_at?: string | null; status?: PostStatus };
        Relationships: [
          { foreignKeyName: "posts_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
        ];
      };
      post_targets: {
        Row: { id: string; post_id: string; workspace_id: string; social_account_id: string; caption_override: string | null; platform_options: Json; status: PostStatus; external_post_id: string | null; external_url: string | null; error_code: string | null; attempts: number; published_at: string | null; created_at: string; updated_at: string };
        Insert: { post_id: string; workspace_id: string; social_account_id: string; caption_override?: string | null; platform_options?: Json };
        Update: { caption_override?: string | null; platform_options?: Json; status?: PostStatus; external_post_id?: string | null; external_url?: string | null; error_code?: string | null; attempts?: number; published_at?: string | null };
        Relationships: [
          { foreignKeyName: "post_targets_social_account_id_fkey"; columns: ["social_account_id"]; isOneToOne: false; referencedRelation: "social_accounts"; referencedColumns: ["id"] },
          { foreignKeyName: "post_targets_post_id_fkey"; columns: ["post_id"]; isOneToOne: false; referencedRelation: "posts"; referencedColumns: ["id"] },
        ];
      };
      assets: {
        Row: { id: string; workspace_id: string; project_id: string; storage_path: string; mime_type: string; size_bytes: number | null; width: number | null; height: number | null; duration_seconds: number | null; source: "upload" | "ai"; ai_generated: boolean; generation_id: string | null; created_by: string | null; created_at: string };
        Insert: { workspace_id: string; project_id: string; storage_path: string; mime_type: string; size_bytes?: number | null; width?: number | null; height?: number | null; source: "upload" | "ai"; ai_generated?: boolean; generation_id?: string | null; created_by?: string | null };
        Update: never;
        Relationships: [];
      };
      ai_generations: {
        Row: { id: string; workspace_id: string; project_id: string; kind: string; provider: string; model: string; prompt: string; params: Json; credits_cost: number; status: string; provider_request_id: string | null; error_code: string | null; license: Json; created_by: string | null; created_at: string; completed_at: string | null };
        Insert: { workspace_id: string; project_id: string; kind: string; provider: string; model: string; prompt: string; params?: Json; credits_cost: number; status?: string; license?: Json; created_by?: string | null };
        Update: { status?: string; provider_request_id?: string | null; error_code?: string | null; completed_at?: string | null; params?: Json };
        Relationships: [];
      };
      account_metrics_daily: {
        Row: { social_account_id: string; workspace_id: string; day: string; followers: number | null; views: number | null; likes: number | null; comments: number | null; shares: number | null; posts_count: number | null; captured_at: string };
        Insert: { social_account_id: string; workspace_id: string; day: string; followers?: number | null; views?: number | null; likes?: number | null; comments?: number | null; shares?: number | null; posts_count?: number | null };
        Update: { followers?: number | null; views?: number | null; likes?: number | null; posts_count?: number | null };
        Relationships: [
          { foreignKeyName: "account_metrics_daily_social_account_id_fkey"; columns: ["social_account_id"]; isOneToOne: false; referencedRelation: "social_accounts"; referencedColumns: ["id"] },
        ];
      };
      waitlist: {
        Row: { id: string; email: string; locale: string; referral_code: string; referred_by: string | null; confirm_token_hash: string | null; unsubscribe_token_hash: string; consent_at: string; confirmed_at: string | null; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      credit_purchases: {
        Row: { id: string; workspace_id: string; purchased_by: string | null; pack_id: string; credits: number; amount_total: number; currency: string; stripe_checkout_session_id: string; stripe_payment_intent_id: string | null; invoice_url: string | null; status: string; created_at: string; paid_at: string | null };
        Insert: { workspace_id: string; purchased_by?: string | null; pack_id: string; credits: number; amount_total: number; currency: string; stripe_checkout_session_id: string };
        Update: { status?: string; paid_at?: string | null; amount_total?: number; currency?: string; stripe_payment_intent_id?: string | null; invoice_url?: string | null };
        Relationships: [];
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
    } & ResearchTables & StrategyTables & InboxTables & TeamTables & CommerceTables;
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
      upsert_social_account: {
        Args: { p_project_id: string; p_platform: SocialPlatform; p_external_id: string; p_handle: string; p_display_name: string; p_avatar_url: string; p_granted_scopes: string[]; p_missing_scopes: string[]; p_metadata?: Json };
        Returns: string;
      };
      submit_post: { Args: { p_post_id: string }; Returns: undefined };
      approve_post: { Args: { p_post_id: string }; Returns: PostStatus };
      unschedule_post: { Args: { p_post_id: string; p_cancel?: boolean }; Returns: undefined };
      post_limit_violations: { Args: { p_post_id: string }; Returns: { social_account_id: string; handle: string | null; day: string; planned: number; daily_limit: number }[] };
      start_ai_generation: {
        Args: { p_project_id: string; p_kind: string; p_provider: string; p_model: string; p_prompt: string; p_params: Json; p_credits: number; p_license: Json; p_idempotency_key: string };
        Returns: string;
      };
      my_blocking_workspaces: { Args: Record<string, never>; Returns: { workspace_id: string; name: string }[] };
      my_solo_workspaces: { Args: Record<string, never>; Returns: string[] };
      delete_my_account: { Args: Record<string, never>; Returns: undefined };
      waitlist_join: {
        Args: { p_email: string; p_ref: string; p_locale: string };
        Returns: { confirm_token: string | null; unsubscribe_token: string | null; already_confirmed: boolean }[];
      };
      waitlist_confirm: { Args: { p_token: string }; Returns: string | null };
      waitlist_unsubscribe: { Args: { p_token: string }; Returns: boolean };
      waitlist_status: { Args: { p_code: string }; Returns: { rank_position: number; total: number; referrals: number }[] };
    } & ResearchFunctions & StrategyFunctions & InboxFunctions & TeamFunctions & CommerceFunctions;
    Enums: { workspace_role: WorkspaceRole; social_platform: SocialPlatform; connection_status: ConnectionStatus; post_status: PostStatus };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type WorkspaceRoleT = WorkspaceRole;
