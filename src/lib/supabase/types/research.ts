// Tipos de las tablas y funciones del módulo "research". Se combinan en ../database.types.ts.
// Migración: supabase/migrations/20261120100000_research.sql
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Rel = { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[] };

type CompetitorRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  platform: "youtube" | "instagram" | "tiktok";
  external_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  profile_url: string | null;
  followers: number | null;
  total_views: number | null;
  media_count: number | null;
  via_social_account_id: string | null;
  last_fetched_at: string | null;
  fetch_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type CompetitorPostRow = {
  id: string;
  competitor_id: string;
  workspace_id: string;
  external_id: string;
  title: string | null;
  url: string | null;
  thumbnail_url: string | null;
  media_type: string | null;
  published_at: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  fetched_at: string;
};

type AlertRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  competitor_id: string;
  post_id: string;
  multiple: number;
  seen_at: string | null;
  created_at: string;
};

type ProductListRow = { id: string; workspace_id: string; project_id: string; name: string; created_by: string | null; created_at: string };

type ProductRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  list_id: string | null;
  title: string;
  notes: string;
  supplier_url: string | null;
  source: "manual" | "meta_ad_library";
  ad_archive_id: string | null;
  page_name: string | null;
  ad_snapshot_url: string | null;
  ad_text: string | null;
  platforms: string[];
  countries: string[];
  ad_started_at: string | null;
  score: number | null;
  score_breakdown: Json;
  currency: string;
  sale_price: number | null;
  unit_cost: number | null;
  shipping_cost: number | null;
  fee_pct: number | null;
  cpa: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type SwipeRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  url: string;
  network: "youtube" | "tiktok" | "instagram" | "facebook" | "other";
  kind: "video" | "ad" | "post";
  title: string | null;
  author_name: string | null;
  thumbnail_url: string | null;
  oembed_fetched_at: string | null;
  notes: string;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type HookRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  text: string;
  niche: string;
  format: string;
  source: "user" | "ai";
  generation_id: string | null;
  created_by: string | null;
  created_at: string;
};

type AnalysisRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  subject_type: "competitor" | "product";
  subject_id: string;
  agent_version: string;
  result: Json;
  generation_id: string | null;
  created_by: string | null;
  created_at: string;
};

/** Insert: columnas con valor por defecto o anulables pasan a ser opcionales. */
type Ins<R, Required extends keyof R> = Pick<R, Required> & Partial<Omit<R, Required>>;

export type ResearchTables = {
  research_competitors: {
    Row: CompetitorRow;
    Insert: Ins<CompetitorRow, "workspace_id" | "project_id" | "platform" | "external_id">;
    Update: Partial<CompetitorRow>;
    Relationships: Rel[];
  };
  research_competitor_posts: {
    Row: CompetitorPostRow;
    Insert: Ins<CompetitorPostRow, "competitor_id" | "workspace_id" | "external_id">;
    Update: Partial<CompetitorPostRow>;
    Relationships: [
      { foreignKeyName: "research_competitor_posts_competitor_id_fkey"; columns: ["competitor_id"]; isOneToOne: false; referencedRelation: "research_competitors"; referencedColumns: ["id"] },
    ];
  };
  research_alerts: {
    Row: AlertRow;
    Insert: Ins<AlertRow, "workspace_id" | "project_id" | "competitor_id" | "post_id" | "multiple">;
    Update: Partial<AlertRow>;
    Relationships: [
      { foreignKeyName: "research_alerts_competitor_id_fkey"; columns: ["competitor_id"]; isOneToOne: false; referencedRelation: "research_competitors"; referencedColumns: ["id"] },
      { foreignKeyName: "research_alerts_post_id_fkey"; columns: ["post_id"]; isOneToOne: true; referencedRelation: "research_competitor_posts"; referencedColumns: ["id"] },
    ];
  };
  research_product_lists: {
    Row: ProductListRow;
    Insert: Ins<ProductListRow, "workspace_id" | "project_id" | "name">;
    Update: Partial<ProductListRow>;
    Relationships: Rel[];
  };
  research_products: {
    Row: ProductRow;
    Insert: Ins<ProductRow, "workspace_id" | "project_id" | "title">;
    Update: Partial<ProductRow>;
    Relationships: [
      { foreignKeyName: "research_products_list_id_fkey"; columns: ["list_id"]; isOneToOne: false; referencedRelation: "research_product_lists"; referencedColumns: ["id"] },
    ];
  };
  research_swipes: {
    Row: SwipeRow;
    Insert: Ins<SwipeRow, "workspace_id" | "project_id" | "url" | "network" | "kind">;
    Update: Partial<SwipeRow>;
    Relationships: Rel[];
  };
  research_hooks: {
    Row: HookRow;
    Insert: Ins<HookRow, "workspace_id" | "project_id" | "text">;
    Update: Partial<HookRow>;
    Relationships: Rel[];
  };
  research_analyses: {
    Row: AnalysisRow;
    Insert: Ins<AnalysisRow, "workspace_id" | "project_id" | "subject_type" | "subject_id" | "agent_version" | "result">;
    Update: Partial<AnalysisRow>;
    Relationships: Rel[];
  };
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ResearchFunctions = {};
