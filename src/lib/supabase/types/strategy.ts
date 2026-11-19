// Tipos de las tablas y funciones del módulo "strategy". Se combinan en ../database.types.ts.
// Migración: supabase/migrations/20261120110000_strategy.sql
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type SocialPlatform = "tiktok" | "instagram" | "youtube";
export type RoadmapTaskStatus = "todo" | "doing" | "done";
export type WarmupPlanStatus = "active" | "completed" | "archived";
export type WarmupCategory = "profile" | "content" | "engage" | "safety" | "learn";

export type StrategyTables = {
  strategies: {
    Row: {
      id: string;
      workspace_id: string;
      project_id: string;
      social_account_id: string | null;
      title: string;
      summary: string;
      audience: string;
      pillars: Json;
      frequency: Json;
      objectives: Json;
      source: "manual" | "template" | "ai";
      prompt_version: string | null;
      ai_generation_id: string | null;
      created_by: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      workspace_id: string;
      project_id: string;
      social_account_id?: string | null;
      title?: string;
      summary?: string;
      audience?: string;
      pillars?: Json;
      frequency?: Json;
      objectives?: Json;
      source?: "manual" | "template" | "ai";
      prompt_version?: string | null;
      ai_generation_id?: string | null;
      created_by?: string | null;
    };
    Update: {
      title?: string;
      summary?: string;
      audience?: string;
      pillars?: Json;
      frequency?: Json;
      objectives?: Json;
      source?: "manual" | "template" | "ai";
      prompt_version?: string | null;
      ai_generation_id?: string | null;
    };
    Relationships: [
      { foreignKeyName: "strategies_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
      { foreignKeyName: "strategies_social_account_id_fkey"; columns: ["social_account_id"]; isOneToOne: false; referencedRelation: "social_accounts"; referencedColumns: ["id"] },
    ];
  };
  roadmap_milestones: {
    Row: {
      id: string;
      workspace_id: string;
      project_id: string;
      strategy_id: string;
      title: string;
      description: string;
      due_date: string | null;
      position: number;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      workspace_id: string;
      project_id: string;
      strategy_id: string;
      title: string;
      description?: string;
      due_date?: string | null;
      position?: number;
    };
    Update: { title?: string; description?: string; due_date?: string | null; position?: number };
    Relationships: [
      { foreignKeyName: "roadmap_milestones_strategy_id_fkey"; columns: ["strategy_id"]; isOneToOne: false; referencedRelation: "strategies"; referencedColumns: ["id"] },
    ];
  };
  roadmap_tasks: {
    Row: {
      id: string;
      workspace_id: string;
      project_id: string;
      strategy_id: string;
      milestone_id: string;
      title: string;
      brief: string;
      platform: SocialPlatform | null;
      status: RoadmapTaskStatus;
      assignee_id: string | null;
      due_date: string | null;
      position: number;
      post_id: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      workspace_id: string;
      project_id: string;
      strategy_id: string;
      milestone_id: string;
      title: string;
      brief?: string;
      platform?: SocialPlatform | null;
      status?: RoadmapTaskStatus;
      assignee_id?: string | null;
      due_date?: string | null;
      position?: number;
      post_id?: string | null;
    };
    Update: {
      milestone_id?: string;
      title?: string;
      brief?: string;
      platform?: SocialPlatform | null;
      status?: RoadmapTaskStatus;
      assignee_id?: string | null;
      due_date?: string | null;
      position?: number;
      post_id?: string | null;
    };
    Relationships: [
      { foreignKeyName: "roadmap_tasks_milestone_id_fkey"; columns: ["milestone_id"]; isOneToOne: false; referencedRelation: "roadmap_milestones"; referencedColumns: ["id"] },
      { foreignKeyName: "roadmap_tasks_post_id_fkey"; columns: ["post_id"]; isOneToOne: false; referencedRelation: "posts"; referencedColumns: ["id"] },
    ];
  };
  warmup_plans: {
    Row: {
      id: string;
      workspace_id: string;
      project_id: string;
      social_account_id: string | null;
      platform: SocialPlatform;
      handle: string | null;
      niche: string;
      locale: "es" | "en";
      start_date: string;
      duration_days: number;
      status: WarmupPlanStatus;
      issues: string[];
      source: "template" | "ai";
      prompt_version: string | null;
      ai_generation_id: string | null;
      reminder_user_id: string | null;
      needs_attention: boolean;
      pending_count: number;
      last_checked_at: string | null;
      last_reminded_at: string | null;
      created_by: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      workspace_id: string;
      project_id: string;
      social_account_id?: string | null;
      platform: SocialPlatform;
      handle?: string | null;
      niche?: string;
      locale?: "es" | "en";
      start_date: string;
      duration_days: number;
      status?: WarmupPlanStatus;
      issues?: string[];
      source?: "template" | "ai";
      prompt_version?: string | null;
      ai_generation_id?: string | null;
      reminder_user_id?: string | null;
      created_by?: string | null;
    };
    Update: {
      social_account_id?: string | null;
      handle?: string | null;
      niche?: string;
      status?: WarmupPlanStatus;
      issues?: string[];
      source?: "template" | "ai";
      prompt_version?: string | null;
      ai_generation_id?: string | null;
      reminder_user_id?: string | null;
      needs_attention?: boolean;
      pending_count?: number;
      last_checked_at?: string | null;
      last_reminded_at?: string | null;
    };
    Relationships: [
      { foreignKeyName: "warmup_plans_social_account_id_fkey"; columns: ["social_account_id"]; isOneToOne: false; referencedRelation: "social_accounts"; referencedColumns: ["id"] },
      { foreignKeyName: "warmup_plans_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
    ];
  };
  warmup_tasks: {
    Row: {
      id: string;
      workspace_id: string;
      plan_id: string;
      day: number;
      position: number;
      category: WarmupCategory;
      title: string;
      detail: string;
      target_count: number | null;
      source: "template" | "ai" | "adjust";
      done_at: string | null;
      done_by: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      workspace_id: string;
      plan_id: string;
      day: number;
      position?: number;
      category: WarmupCategory;
      title: string;
      detail?: string;
      target_count?: number | null;
      source?: "template" | "ai" | "adjust";
    };
    Update: { done_at?: string | null; done_by?: string | null };
    Relationships: [
      { foreignKeyName: "warmup_tasks_plan_id_fkey"; columns: ["plan_id"]; isOneToOne: false; referencedRelation: "warmup_plans"; referencedColumns: ["id"] },
    ];
  };
};
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type StrategyFunctions = {};
