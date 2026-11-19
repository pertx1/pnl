-- =============================================================================
-- Kreo · Compra de créditos con Stripe (pago único). Solo el servidor (webhook de Stripe) escribe.
-- =============================================================================
create table public.credit_purchases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  purchased_by uuid references auth.users (id) on delete set null,
  pack_id text not null,
  credits int not null check (credits > 0),
  amount_total int not null,             -- en céntimos, IVA incluido
  currency text not null,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text,
  invoice_url text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index credit_purchases_workspace_idx on public.credit_purchases (workspace_id, created_at desc);
create index credit_purchases_purchased_by_idx on public.credit_purchases (purchased_by);

alter table public.credit_purchases enable row level security;
create policy "credit_purchases_select_admin" on public.credit_purchases for select to authenticated
  using (public.has_workspace_role(workspace_id, 'admin'));
create policy "mfa_required" on public.credit_purchases as restrictive for all to authenticated
  using ((select public.mfa_satisfied()));
