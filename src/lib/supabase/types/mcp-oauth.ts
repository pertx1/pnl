// Tipos de las tablas y funciones del servidor de autorización OAuth del MCP. Se combinan en ../database.types.ts.
// Migración: supabase/migrations/20261123100000_mcp_oauth.sql
type OAuthResult = { status: "ok" | "invalid_grant" | "invalid_target"; grant_id: string | null; scope: string | null }[];

export type McpOAuthTables = {
  mcp_oauth_clients: {
    Row: {
      id: string;
      client_id: string;
      kind: "dcr" | "cimd";
      client_name: string;
      client_uri: string | null;
      redirect_uris: string[];
      metadata_fetched_at: string | null;
      last_used_at: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      client_id: string;
      kind: "dcr" | "cimd";
      client_name?: string;
      client_uri?: string | null;
      redirect_uris: string[];
      metadata_fetched_at?: string | null;
      last_used_at?: string | null;
    };
    Update: { client_name?: string; client_uri?: string | null; redirect_uris?: string[]; metadata_fetched_at?: string | null; last_used_at?: string | null };
    Relationships: [];
  };
  mcp_oauth_codes: {
    Row: {
      id: string;
      code_hash: string;
      client_id: string;
      user_id: string;
      workspace_id: string;
      redirect_uri: string;
      code_challenge: string;
      scope: string;
      resource: string;
      expires_at: string;
      used_at: string | null;
      created_at: string;
    };
    Insert: never;
    Update: never;
    Relationships: [];
  };
  mcp_oauth_grants: {
    Row: {
      id: string;
      user_id: string;
      workspace_id: string;
      client_id: string;
      client_name: string;
      client_host: string;
      scope: string;
      resource: string;
      code_id: string | null;
      last_used_at: string | null;
      revoked_at: string | null;
      created_at: string;
    };
    Insert: never;
    Update: never;
    Relationships: [
      { foreignKeyName: "mcp_oauth_grants_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] },
    ];
  };
  mcp_oauth_tokens: {
    Row: { id: string; grant_id: string; kind: "access" | "refresh"; token_hash: string; expires_at: string; used_at: string | null; revoked_at: string | null; created_at: string };
    Insert: never;
    Update: never;
    Relationships: [];
  };
  mcp_oauth_rate_limits: {
    Row: { subject: string; bucket: "minute" | "day"; window_start: string; hits: number };
    Insert: never;
    Update: never;
    Relationships: [];
  };
};

export type McpOAuthFunctions = {
  mcp_oauth_create_code: {
    Args: { p_code_hash: string; p_client_id: string; p_workspace_id: string; p_redirect_uri: string; p_code_challenge: string; p_scope: string; p_resource: string };
    Returns: undefined;
  };
  mcp_oauth_exchange_code: {
    Args: {
      p_code_hash: string;
      p_client_id: string;
      p_redirect_uri: string;
      p_code_challenge: string;
      p_resource: string | null;
      p_access_hash: string;
      p_refresh_hash: string;
      p_access_ttl: number;
      p_refresh_ttl: number;
    };
    Returns: OAuthResult;
  };
  mcp_oauth_refresh: {
    Args: {
      p_refresh_hash: string;
      p_client_id: string;
      p_resource: string | null;
      p_access_hash: string;
      p_refresh_hash_new: string;
      p_access_ttl: number;
      p_refresh_ttl: number;
    };
    Returns: OAuthResult;
  };
  mcp_oauth_verify_access: {
    Args: { p_hash: string };
    Returns: { grant_id: string; user_id: string; workspace_id: string; client_id: string; scope: string; resource: string }[];
  };
  mcp_oauth_revoke_token: { Args: { p_hash: string; p_client_id: string | null }; Returns: undefined };
  revoke_mcp_oauth_grant: { Args: { p_id: string }; Returns: undefined };
  mcp_oauth_rate_limit_hit: { Args: { p_subject: string; p_per_minute: number; p_per_day: number }; Returns: boolean };
};
