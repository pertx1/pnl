// Tipos de las tablas y funciones del módulo "inbox" (bandeja) y "clipper". Se combinan en ../database.types.ts.
import type { Json } from "../database.types";

export type InboxChannel = "instagram" | "gmail" | "outlook";
type ConnStatus = "active" | "expired" | "revoked" | "error";
type ThreadStatus = "open" | "archived";
type ClipJobStatus = "transcribing" | "analyzing" | "ready" | "failed";
type ClipSegmentStatus = "proposed" | "rendering" | "done" | "failed";
type RenderStep = "trim" | "scale" | "subtitle";

export type InboxTables = {
  inbox_connections: {
    Row: { id: string; workspace_id: string; project_id: string; channel: InboxChannel; external_id: string; display_name: string | null; social_account_id: string | null; status: ConnStatus; granted_scopes: string[]; metadata: Json; connected_by: string | null; last_synced_at: string | null; created_at: string; updated_at: string };
    Insert: { id?: string; workspace_id: string; project_id: string; channel: InboxChannel; external_id: string; display_name?: string | null; social_account_id?: string | null; status?: ConnStatus; granted_scopes?: string[]; metadata?: Json; connected_by?: string | null; last_synced_at?: string | null };
    Update: { display_name?: string | null; status?: ConnStatus; granted_scopes?: string[]; metadata?: Json; last_synced_at?: string | null; connected_by?: string | null; social_account_id?: string | null };
    Relationships: [
      { foreignKeyName: "inbox_connections_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
    ];
  };
  inbox_connection_tokens: {
    Row: { connection_id: string; access_token_enc: string; refresh_token_enc: string | null; access_expires_at: string | null; updated_at: string };
    Insert: { connection_id: string; access_token_enc: string; refresh_token_enc?: string | null; access_expires_at?: string | null; updated_at?: string };
    Update: { access_token_enc?: string; refresh_token_enc?: string | null; access_expires_at?: string | null; updated_at?: string };
    Relationships: [];
  };
  inbox_threads: {
    Row: { id: string; workspace_id: string; project_id: string; connection_id: string; external_thread_id: string; subject: string | null; counterpart_name: string | null; counterpart_handle: string | null; snippet: string | null; last_message_at: string | null; last_inbound_at: string | null; status: ThreadStatus; unread: boolean; needs_reply: boolean; replied_at: string | null; metadata: Json; created_at: string; updated_at: string };
    Insert: { id?: string; workspace_id: string; project_id: string; connection_id: string; external_thread_id: string; subject?: string | null; counterpart_name?: string | null; counterpart_handle?: string | null; snippet?: string | null; last_message_at?: string | null; last_inbound_at?: string | null; status?: ThreadStatus; unread?: boolean; needs_reply?: boolean; replied_at?: string | null; metadata?: Json };
    Update: { subject?: string | null; counterpart_name?: string | null; counterpart_handle?: string | null; snippet?: string | null; last_message_at?: string | null; last_inbound_at?: string | null; status?: ThreadStatus; unread?: boolean; needs_reply?: boolean; replied_at?: string | null; metadata?: Json };
    Relationships: [
      { foreignKeyName: "inbox_threads_connection_id_fkey"; columns: ["connection_id"]; isOneToOne: false; referencedRelation: "inbox_connections"; referencedColumns: ["id"] },
    ];
  };
  inbox_messages: {
    Row: { id: string; workspace_id: string; thread_id: string; external_message_id: string; direction: "in" | "out"; sender_name: string | null; body_text: string; sent_at: string; sent_by: string | null; ai_assisted: boolean; metadata: Json; expires_at: string; created_at: string };
    Insert: { id?: string; workspace_id: string; thread_id: string; external_message_id: string; direction: "in" | "out"; sender_name?: string | null; body_text?: string; sent_at: string; sent_by?: string | null; ai_assisted?: boolean; metadata?: Json; expires_at?: string };
    Update: { body_text?: string; metadata?: Json };
    Relationships: [
      { foreignKeyName: "inbox_messages_thread_id_fkey"; columns: ["thread_id"]; isOneToOne: false; referencedRelation: "inbox_threads"; referencedColumns: ["id"] },
    ];
  };
  inbox_drafts: {
    Row: { thread_id: string; workspace_id: string; body: string; ai_generated: boolean; prompt_version: string | null; updated_by: string | null; updated_at: string };
    Insert: { thread_id: string; workspace_id: string; body?: string; ai_generated?: boolean; prompt_version?: string | null; updated_by?: string | null; updated_at?: string };
    Update: { body?: string; ai_generated?: boolean; prompt_version?: string | null; updated_by?: string | null; updated_at?: string };
    Relationships: [];
  };
  clip_jobs: {
    Row: { id: string; workspace_id: string; project_id: string; source_asset_id: string | null; title: string | null; status: ClipJobStatus; declared_duration_s: number; duration_s: number | null; language: string | null; transcript: Json | null; generation_id: string | null; provider_state: Json; error_code: string | null; rights_confirmed_at: string; created_by: string | null; created_at: string; updated_at: string };
    Insert: { id?: string; workspace_id: string; project_id: string; source_asset_id?: string | null; title?: string | null; status?: ClipJobStatus; declared_duration_s: number; duration_s?: number | null; language?: string | null; transcript?: Json | null; generation_id?: string | null; provider_state?: Json; error_code?: string | null; rights_confirmed_at: string; created_by?: string | null };
    Update: { title?: string | null; status?: ClipJobStatus; duration_s?: number | null; language?: string | null; transcript?: Json | null; generation_id?: string | null; provider_state?: Json; error_code?: string | null };
    Relationships: [];
  };
  clip_segments: {
    Row: { id: string; job_id: string; workspace_id: string; project_id: string; start_s: number; end_s: number; title: string; hook: string | null; reason: string | null; score: number; status: ClipSegmentStatus; render_step: RenderStep | null; subtitles: boolean; generation_id: string | null; asset_id: string | null; provider_state: Json; error_code: string | null; created_at: string; updated_at: string };
    Insert: { id?: string; job_id: string; workspace_id: string; project_id: string; start_s: number; end_s: number; title: string; hook?: string | null; reason?: string | null; score?: number; status?: ClipSegmentStatus; render_step?: RenderStep | null; subtitles?: boolean; generation_id?: string | null; asset_id?: string | null; provider_state?: Json; error_code?: string | null };
    Update: { start_s?: number; end_s?: number; title?: string; hook?: string | null; status?: ClipSegmentStatus; render_step?: RenderStep | null; subtitles?: boolean; generation_id?: string | null; asset_id?: string | null; provider_state?: Json; error_code?: string | null };
    Relationships: [
      { foreignKeyName: "clip_segments_job_id_fkey"; columns: ["job_id"]; isOneToOne: false; referencedRelation: "clip_jobs"; referencedColumns: ["id"] },
    ];
  };
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type InboxFunctions = {};
