// Tipos de las tablas y funciones del módulo "team" (equipo, suscripciones y afiliados). Se combinan en ../database.types.ts.
// Migración: supabase/migrations/20261120130000_team.sql

type Role = "viewer" | "editor" | "admin" | "owner";

export type TeamTables = {
  workspace_invitations: {
    Row: {
      accepted_at: string | null;
      accepted_by: string | null;
      created_at: string;
      email: string;
      expires_at: string;
      id: string;
      invited_by: string | null;
      revoked_at: string | null;
      role: Role;
      token_hash: string;
      workspace_id: string;
    };
    Insert: {
      accepted_at?: string | null;
      accepted_by?: string | null;
      created_at?: string;
      email: string;
      expires_at?: string;
      id?: string;
      invited_by?: string | null;
      revoked_at?: string | null;
      role: Role;
      token_hash: string;
      workspace_id: string;
    };
    Update: {
      accepted_at?: string | null;
      accepted_by?: string | null;
      created_at?: string;
      email?: string;
      expires_at?: string;
      id?: string;
      invited_by?: string | null;
      revoked_at?: string | null;
      role?: Role;
      token_hash?: string;
      workspace_id?: string;
    };
    Relationships: [
      { foreignKeyName: "workspace_invitations_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] },
    ];
  };
  workspace_subscriptions: {
    Row: {
      cancel_at_period_end: boolean;
      created_at: string;
      current_period_end: string | null;
      customer_id: string;
      plan_id: string;
      provider: string;
      status: string;
      subscribed_by: string | null;
      subscription_id: string | null;
      updated_at: string;
      workspace_id: string;
    };
    Insert: {
      cancel_at_period_end?: boolean;
      created_at?: string;
      current_period_end?: string | null;
      customer_id: string;
      plan_id?: string;
      provider?: string;
      status?: string;
      subscribed_by?: string | null;
      subscription_id?: string | null;
      updated_at?: string;
      workspace_id: string;
    };
    Update: {
      cancel_at_period_end?: boolean;
      created_at?: string;
      current_period_end?: string | null;
      customer_id?: string;
      plan_id?: string;
      provider?: string;
      status?: string;
      subscribed_by?: string | null;
      subscription_id?: string | null;
      updated_at?: string;
      workspace_id?: string;
    };
    Relationships: [
      { foreignKeyName: "workspace_subscriptions_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: true; referencedRelation: "workspaces"; referencedColumns: ["id"] },
      { foreignKeyName: "workspace_subscriptions_plan_id_fkey"; columns: ["plan_id"]; isOneToOne: false; referencedRelation: "plans"; referencedColumns: ["id"] },
    ];
  };
  affiliates: {
    Row: { code: string; created_at: string; status: string; terms_accepted_at: string; user_id: string };
    Insert: { code: string; created_at?: string; status?: string; terms_accepted_at: string; user_id: string };
    Update: { code?: string; created_at?: string; status?: string; terms_accepted_at?: string; user_id?: string };
    Relationships: [];
  };
  affiliate_click_stats: {
    Row: { affiliate_id: string; clicks: number; day: string };
    Insert: { affiliate_id: string; clicks?: number; day: string };
    Update: { affiliate_id?: string; clicks?: number; day?: string };
    Relationships: [];
  };
  referrals: {
    Row: { affiliate_id: string; converted_at: string | null; created_at: string; id: string; referred_user_id: string | null; source: string };
    Insert: { affiliate_id: string; converted_at?: string | null; created_at?: string; id?: string; referred_user_id?: string | null; source: string };
    Update: { affiliate_id?: string; converted_at?: string | null; created_at?: string; id?: string; referred_user_id?: string | null; source?: string };
    Relationships: [];
  };
  affiliate_commissions: {
    Row: {
      affiliate_id: string;
      commission_cents: number;
      created_at: string;
      currency: string;
      id: string;
      net_amount_cents: number;
      paid_at: string | null;
      paid_reference: string | null;
      provider_invoice_id: string;
      rate: number;
      referral_id: string | null;
      status: string;
    };
    Insert: {
      affiliate_id: string;
      commission_cents: number;
      created_at?: string;
      currency: string;
      id?: string;
      net_amount_cents: number;
      paid_at?: string | null;
      paid_reference?: string | null;
      provider_invoice_id: string;
      rate: number;
      referral_id?: string | null;
      status?: string;
    };
    Update: {
      affiliate_id?: string;
      commission_cents?: number;
      created_at?: string;
      currency?: string;
      id?: string;
      net_amount_cents?: number;
      paid_at?: string | null;
      paid_reference?: string | null;
      provider_invoice_id?: string;
      rate?: number;
      referral_id?: string | null;
      status?: string;
    };
    Relationships: [
      { foreignKeyName: "affiliate_commissions_affiliate_id_fkey"; columns: ["affiliate_id"]; isOneToOne: false; referencedRelation: "affiliates"; referencedColumns: ["user_id"] },
    ];
  };
};

export type TeamFunctions = {
  workspace_member_capacity: { Args: { p_workspace_id: string }; Returns: { members: number; pending: number; max_members: number }[] };
  team_members: {
    Args: { p_workspace_id: string };
    Returns: { user_id: string; role: Role; full_name: string | null; email: string | null; joined_at: string }[];
  };
  activity_actors: { Args: { p_workspace_id: string }; Returns: { user_id: string; full_name: string | null }[] };
  create_invitation: { Args: { p_workspace_id: string; p_email: string; p_role: Role }; Returns: { invitation_id: string; token: string }[] };
  revoke_invitation: { Args: { p_invitation_id: string }; Returns: undefined };
  invitation_preview: {
    Args: { p_token: string };
    Returns: { workspace_name: string; role: Role; inviter_name: string | null; email_hint: string; status: string }[];
  };
  accept_invitation: { Args: { p_token: string }; Returns: string };
  change_member_role: { Args: { p_workspace_id: string; p_user_id: string; p_role: Role }; Returns: undefined };
  transfer_ownership: { Args: { p_workspace_id: string; p_user_id: string }; Returns: undefined };
  remove_member: { Args: { p_workspace_id: string; p_user_id: string }; Returns: undefined };
  leave_workspace: { Args: { p_workspace_id: string }; Returns: undefined };
  apply_subscription_state: {
    Args: {
      p_workspace_id: string;
      p_provider: string;
      p_customer_id: string;
      p_subscription_id: string;
      p_plan_id: string;
      p_status: string;
      p_current_period_end: string | null;
      p_cancel_at_period_end: boolean;
      p_subscribed_by?: string | null;
    };
    Returns: string;
  };
  join_affiliate_program: { Args: Record<string, never>; Returns: string };
  record_affiliate_click: { Args: { p_code: string }; Returns: boolean };
  attribute_referral: { Args: { p_user_id: string; p_code: string; p_source: string }; Returns: boolean };
  claim_referral: { Args: { p_code: string; p_source?: string }; Returns: boolean };
  my_affiliate_stats: {
    Args: Record<string, never>;
    Returns: { clicks: number; signups: number; conversions: number; pending_cents: number; paid_cents: number }[];
  };
  record_commission: {
    Args: { p_workspace_id: string; p_invoice_id: string; p_net_cents: number; p_currency: string; p_rate: number; p_max_months: number };
    Returns: number;
  };
  void_commission: { Args: { p_invoice_id: string }; Returns: undefined };
  mark_commission_paid: { Args: { p_commission_id: string; p_reference: string }; Returns: undefined };
};
