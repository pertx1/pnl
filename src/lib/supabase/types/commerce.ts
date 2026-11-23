// Tipos de las tablas y funciones del módulo "commerce" (Shopify, informes, MCP). Se combinan en ../database.types.ts.
import type { Json } from "../database.types";

type WorkspaceRole = "viewer" | "editor" | "admin" | "owner";

export type CommerceTables = {
  shopify_stores: {
    Row: { id: string; workspace_id: string; project_id: string; shop_domain: string; shop_name: string | null; currency: string | null; granted_scopes: string[]; status: "active" | "uninstalled" | "error"; connected_by: string | null; last_synced_at: string | null; sync_error: string | null; uninstalled_at: string | null; created_at: string; updated_at: string };
    Insert: { id?: string; workspace_id: string; project_id: string; shop_domain: string; shop_name?: string | null; currency?: string | null; granted_scopes?: string[]; status?: "active" | "uninstalled" | "error"; connected_by?: string | null; last_synced_at?: string | null; sync_error?: string | null; uninstalled_at?: string | null };
    Update: { shop_name?: string | null; currency?: string | null; granted_scopes?: string[]; status?: "active" | "uninstalled" | "error"; connected_by?: string | null; last_synced_at?: string | null; sync_error?: string | null; uninstalled_at?: string | null; workspace_id?: string; project_id?: string };
    Relationships: [];
  };
  shopify_store_tokens: {
    Row: { store_id: string; access_token_enc: string; refresh_token_enc: string | null; access_expires_at: string | null; refresh_expires_at: string | null; updated_at: string };
    Insert: { store_id: string; access_token_enc: string; refresh_token_enc?: string | null; access_expires_at?: string | null; refresh_expires_at?: string | null; updated_at?: string };
    Update: { access_token_enc?: string; refresh_token_enc?: string | null; access_expires_at?: string | null; refresh_expires_at?: string | null; updated_at?: string };
    Relationships: [];
  };
  shopify_orders: {
    Row: { store_id: string; shopify_order_id: number; workspace_id: string; project_id: string; order_number: string | null; ordered_at: string; total: number; currency: string; discount_codes: string[]; landing_path: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; line_items: Json; cancelled: boolean; test: boolean; synced_at: string };
    Insert: { store_id: string; shopify_order_id: number; workspace_id: string; project_id: string; order_number?: string | null; ordered_at: string; total: number; currency: string; discount_codes?: string[]; landing_path?: string | null; utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null; utm_content?: string | null; line_items?: Json; cancelled?: boolean; test?: boolean; synced_at?: string };
    Update: { order_number?: string | null; ordered_at?: string; total?: number; currency?: string; discount_codes?: string[]; landing_path?: string | null; utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null; utm_content?: string | null; line_items?: Json; cancelled?: boolean; test?: boolean; synced_at?: string };
    Relationships: [];
  };
  commerce_attributions: {
    Row: { id: string; workspace_id: string; project_id: string; kind: "utm" | "discount"; post_id: string | null; creator_label: string | null; label: string; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; url: string | null; discount_code: string | null; discount_percent: number | null; shopify_discount_id: string | null; created_by: string | null; created_at: string };
    Insert: { id?: string; workspace_id: string; project_id: string; kind: "utm" | "discount"; post_id?: string | null; creator_label?: string | null; label: string; utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null; url?: string | null; discount_code?: string | null; discount_percent?: number | null; shopify_discount_id?: string | null; created_by?: string | null };
    Update: never;
    Relationships: [
      { foreignKeyName: "commerce_attributions_post_id_fkey"; columns: ["post_id"]; isOneToOne: false; referencedRelation: "posts"; referencedColumns: ["id"] },
    ];
  };
  report_schedules: {
    Row: { id: string; workspace_id: string; project_id: string; frequency: "weekly" | "monthly"; recipients: string[]; sender_name: string; locale: "es" | "en"; include_sales: boolean; show_footer: boolean; active: boolean; next_run_at: string; last_sent_at: string | null; created_by: string | null; created_at: string; updated_at: string };
    Insert: { id?: string; workspace_id: string; project_id: string; frequency: "weekly" | "monthly"; recipients: string[]; sender_name: string; locale?: "es" | "en"; include_sales?: boolean; show_footer?: boolean; active?: boolean; next_run_at: string; created_by?: string | null };
    Update: { frequency?: "weekly" | "monthly"; recipients?: string[]; sender_name?: string; locale?: "es" | "en"; include_sales?: boolean; show_footer?: boolean; active?: boolean; next_run_at?: string; last_sent_at?: string | null };
    Relationships: [];
  };
  report_unsubscribes: {
    Row: { workspace_id: string; email_hash: string; created_at: string };
    Insert: { workspace_id: string; email_hash: string; created_at?: string };
    Update: never;
    Relationships: [];
  };
  mcp_api_keys: {
    Row: { id: string; user_id: string; name: string; prefix: string; key_hash: string; last_used_at: string | null; revoked_at: string | null; created_at: string; allow_credit_spend: boolean; daily_credit_cap: number };
    Insert: never;
    Update: { last_used_at?: string | null };
    Relationships: [];
  };
  mcp_rate_limits: {
    Row: { key_id: string; bucket: "minute" | "day"; window_start: string; hits: number };
    Insert: never;
    Update: never;
    Relationships: [];
  };
};

export type CommerceFunctions = {
  create_mcp_api_key: { Args: { p_name: string; p_prefix: string; p_hash: string }; Returns: string };
  revoke_mcp_api_key: { Args: { p_id: string }; Returns: undefined };
  mcp_rate_limit_hit: { Args: { p_key_id: string; p_per_minute: number; p_per_day: number }; Returns: boolean };
  member_role: { Args: { p_user_id: string; p_workspace_id: string }; Returns: WorkspaceRole | null };
  mcp_start_ai_generation: {
    Args: { p_user_id: string; p_project_id: string; p_kind: string; p_provider: string; p_model: string; p_prompt: string; p_params: Json; p_credits: number; p_license: Json; p_idempotency_key: string };
    Returns: string;
  };
};
