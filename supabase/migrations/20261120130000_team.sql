-- =============================================================================
-- Kreo · Fase 4 · Equipo (invitaciones, roles, propiedad), planes de pago + suscripciones y programa de afiliados.
-- Reglas: RLS en todas las tablas + "mfa_required". Escrituras sensibles SOLO vía funciones SECURITY DEFINER.
-- Los tokens de invitación se guardan como hash SHA-256 (nunca en claro).
-- NO se cambian las políticas existentes de projects/posts (el acceso por proyecto queda como "Próximamente").
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Planes de pago (valores PROVISIONALES; deben coincidir con src/lib/billing/plans.ts)
-- -----------------------------------------------------------------------------
insert into public.plans (id, name, max_projects, max_social_accounts, max_members, monthly_credits, is_public)
values
  ('pro', 'Pro', 10, 15, 3, 1000, true),
  ('agency', 'Agencia', 50, 75, 15, 5000, true)
on conflict (id) do update set
  name = excluded.name,
  max_projects = excluded.max_projects,
  max_social_accounts = excluded.max_social_accounts,
  max_members = excluded.max_members,
  monthly_credits = excluded.monthly_credits,
  is_public = excluded.is_public;

-- -----------------------------------------------------------------------------
-- 2) Invitaciones
-- -----------------------------------------------------------------------------
create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email extensions.citext not null check (char_length(email) <= 254),
  role public.workspace_role not null check (role <> 'owner'),   -- la propiedad solo se transfiere
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index workspace_invitations_workspace_idx on public.workspace_invitations (workspace_id, created_at desc);
create index workspace_invitations_invited_by_idx on public.workspace_invitations (invited_by);
create index workspace_invitations_accepted_by_idx on public.workspace_invitations (accepted_by);
-- Una sola invitación pendiente por email y workspace.
create unique index workspace_invitations_pending_uidx on public.workspace_invitations (workspace_id, email)
  where accepted_at is null and revoked_at is null;

alter table public.workspace_invitations enable row level security;
create policy "invitations_select_admin" on public.workspace_invitations for select to authenticated
  using (public.has_workspace_role(workspace_id, 'admin'));
create policy "mfa_required" on public.workspace_invitations as restrictive for all to authenticated
  using ((select public.mfa_satisfied()));

create or replace function public.invitation_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- Plazas del plan: miembros actuales + invitaciones pendientes vigentes frente a plans.max_members.
create or replace function public.workspace_member_capacity(p_workspace_id uuid)
returns table (members int, pending int, max_members int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::int from public.workspace_members m where m.workspace_id = p_workspace_id),
    (select count(*)::int from public.workspace_invitations i
      where i.workspace_id = p_workspace_id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()),
    (select p.max_members from public.workspaces w join public.plans p on p.id = w.plan_id where w.id = p_workspace_id)
  where public.has_workspace_role(p_workspace_id, 'viewer') or coalesce(auth.role(), '') = 'service_role';
$$;

-- Miembros con nombre. El email solo se devuelve a admins (o el propio).
create or replace function public.team_members(p_workspace_id uuid)
returns table (user_id uuid, role public.workspace_role, full_name text, email text, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.role, p.full_name,
         case when public.has_workspace_role(p_workspace_id, 'admin') or m.user_id = (select auth.uid())
              then u.email::text else null end,
         m.created_at
  from public.workspace_members m
  left join public.profiles p on p.id = m.user_id
  left join auth.users u on u.id = m.user_id
  where m.workspace_id = p_workspace_id
    and public.has_workspace_role(p_workspace_id, 'viewer')
  order by case m.role when 'owner' then 0 when 'admin' then 1 when 'editor' then 2 else 3 end, m.created_at;
$$;

-- Nombres de quienes aparecen en el registro de actividad (incluye antiguos miembros que dejaron rastro). Solo admins.
create or replace function public.activity_actors(p_workspace_id uuid)
returns table (user_id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct a.actor_id, p.full_name
  from public.activity_log a
  left join public.profiles p on p.id = a.actor_id
  where a.workspace_id = p_workspace_id and a.actor_id is not null
    and public.has_workspace_role(p_workspace_id, 'admin');
$$;

-- Crear invitación (admin+). Devuelve el token EN CLARO una sola vez para enviarlo por email.
create or replace function public.create_invitation(p_workspace_id uuid, p_email text, p_role public.workspace_role)
returns table (invitation_id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_max int;
  v_members int;
  v_pending int;
  v_id uuid;
begin
  if not public.has_workspace_role(p_workspace_id, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role is null or p_role = 'owner' then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  -- Bloquea el workspace: dos invitaciones simultáneas no pueden superar el límite.
  select p.max_members into v_max
  from public.workspaces w join public.plans p on p.id = w.plan_id
  where w.id = p_workspace_id
  for update of w;

  if exists (
    select 1 from public.workspace_members m join auth.users u on u.id = m.user_id
    where m.workspace_id = p_workspace_id and lower(u.email) = v_email
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  -- Anti-abuso: como mucho 30 invitaciones por workspace en 24 h.
  if (select count(*) from public.workspace_invitations
      where workspace_id = p_workspace_id and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- Reenviar = revocar la pendiente anterior del mismo email y crear una nueva.
  update public.workspace_invitations set revoked_at = now()
  where workspace_id = p_workspace_id and email = v_email and accepted_at is null and revoked_at is null;

  select count(*) into v_members from public.workspace_members where workspace_id = p_workspace_id;
  select count(*) into v_pending from public.workspace_invitations
  where workspace_id = p_workspace_id and accepted_at is null and revoked_at is null and expires_at > now();
  if v_members + v_pending >= v_max then
    raise exception 'plan_limit_members' using errcode = 'P0001';
  end if;

  insert into public.workspace_invitations (workspace_id, email, role, token_hash, invited_by)
  values (p_workspace_id, v_email, p_role, public.invitation_hash(v_token), (select auth.uid()))
  returning id into v_id;

  perform public.log_activity(p_workspace_id, 'member.invited', 'invitation', v_id::text, jsonb_build_object('role', p_role));
  return query select v_id, v_token;
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_ws uuid;
begin
  select workspace_id into v_ws from public.workspace_invitations
  where id = p_invitation_id and accepted_at is null and revoked_at is null;
  if v_ws is null or not public.has_workspace_role(v_ws, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.workspace_invitations set revoked_at = now() where id = p_invitation_id;
  perform public.log_activity(v_ws, 'invitation.revoked', 'invitation', p_invitation_id::text);
end;
$$;

-- Vista previa de una invitación para la página /invite/[token] (solo servidor). Email enmascarado.
create or replace function public.invitation_preview(p_token text)
returns table (workspace_name text, role public.workspace_role, inviter_name text, email_hint text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select w.name, i.role, p.full_name,
         left(i.email::text, 2) || '•••@' || split_part(i.email::text, '@', 2),
         case when i.accepted_at is not null then 'accepted'
              when i.revoked_at is not null then 'revoked'
              when i.expires_at <= now() then 'expired'
              else 'pending' end
  from public.workspace_invitations i
  join public.workspaces w on w.id = i.workspace_id
  left join public.profiles p on p.id = i.invited_by
  where i.token_hash = public.invitation_hash(p_token);
$$;

-- Aceptar (usuario autenticado cuyo email coincide con el invitado). Devuelve el workspace.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_inv public.workspace_invitations;
  v_email text;
  v_max int;
  v_members int;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'mfa_required' using errcode = '42501';
  end if;

  select * into v_inv from public.workspace_invitations where token_hash = public.invitation_hash(coalesce(p_token, '')) for update;
  if not found or v_inv.revoked_at is not null or v_inv.accepted_at is not null then
    raise exception 'invitation_invalid' using errcode = 'P0001';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;

  select lower(email) into v_email from auth.users where id = v_user;
  if v_email is distinct from lower(v_inv.email::text) then
    raise exception 'invitation_email_mismatch' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.workspace_members where workspace_id = v_inv.workspace_id and user_id = v_user) then
    update public.workspace_invitations set accepted_at = now(), accepted_by = v_user where id = v_inv.id;
    return v_inv.workspace_id;
  end if;

  select p.max_members into v_max
  from public.workspaces w join public.plans p on p.id = w.plan_id
  where w.id = v_inv.workspace_id
  for update of w;
  select count(*) into v_members from public.workspace_members where workspace_id = v_inv.workspace_id;
  if v_members >= v_max then
    raise exception 'plan_limit_members' using errcode = 'P0001';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role) values (v_inv.workspace_id, v_user, v_inv.role);
  update public.workspace_invitations set accepted_at = now(), accepted_by = v_user where id = v_inv.id;
  perform public.log_activity(v_inv.workspace_id, 'member.joined', 'member', v_user::text, jsonb_build_object('role', v_inv.role));
  return v_inv.workspace_id;
end;
$$;

-- Cambiar rol (admin+). Nunca a 'owner' (usa transfer_ownership). Los owners solo los toca otro owner
-- y siempre debe quedar al menos un owner.
create or replace function public.change_member_role(p_workspace_id uuid, p_user_id uuid, p_role public.workspace_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.workspace_role := public.workspace_role_of(p_workspace_id);
  v_target public.workspace_role;
begin
  if not public.has_workspace_role(p_workspace_id, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role is null or p_role = 'owner' then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  perform 1 from public.workspaces where id = p_workspace_id for update;
  select role into v_target from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id;
  if v_target is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_target = 'owner' then
    if v_actor <> 'owner' then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if (select count(*) from public.workspace_members where workspace_id = p_workspace_id and role = 'owner') <= 1 then
      raise exception 'last_owner' using errcode = 'P0001';
    end if;
  end if;

  update public.workspace_members set role = p_role where workspace_id = p_workspace_id and user_id = p_user_id;
  perform public.log_activity(p_workspace_id, 'member.role_changed', 'member', p_user_id::text,
    jsonb_build_object('from', v_target, 'to', p_role));
end;
$$;

-- Transferir la propiedad (solo owner): el destino pasa a owner y quien transfiere a admin.
create or replace function public.transfer_ownership(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if not public.has_workspace_role(p_workspace_id, 'owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id = v_user then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  update public.workspace_members set role = 'owner' where workspace_id = p_workspace_id and user_id = p_user_id;
  update public.workspace_members set role = 'admin' where workspace_id = p_workspace_id and user_id = v_user;
  perform public.log_activity(p_workspace_id, 'ownership.transferred', 'member', p_user_id::text);
end;
$$;

-- Quitar a un miembro (admin+). Un admin no puede quitar a un owner. Para salir uno mismo: leave_workspace.
create or replace function public.remove_member(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.workspace_role := public.workspace_role_of(p_workspace_id);
  v_target public.workspace_role;
begin
  if not public.has_workspace_role(p_workspace_id, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  perform 1 from public.workspaces where id = p_workspace_id for update;
  select role into v_target from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id;
  if v_target is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_target = 'owner' and v_actor <> 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id;
  perform public.log_activity(p_workspace_id, 'member.removed', 'member', p_user_id::text, jsonb_build_object('role', v_target));
end;
$$;

-- Salir de un workspace. El último owner debe transferir antes; el único miembro no puede salir (debe borrarlo).
create or replace function public.leave_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_role public.workspace_role := public.workspace_role_of(p_workspace_id);
begin
  if v_role is null or not public.mfa_satisfied() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id <> v_user) then
    raise exception 'last_member' using errcode = 'P0001';
  end if;
  if v_role = 'owner' and not exists (
    select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id <> v_user and role = 'owner'
  ) then
    raise exception 'transfer_ownership_required' using errcode = 'P0001';
  end if;
  perform public.log_activity(p_workspace_id, 'member.left', 'member', v_user::text);
  delete from public.workspace_members where workspace_id = p_workspace_id and user_id = v_user;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Suscripciones (proveedor intercambiable: Stripe hoy, Paddle quizá mañana). Solo escribe el servidor.
-- -----------------------------------------------------------------------------
create table public.workspace_subscriptions (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  provider text not null default 'stripe' check (provider in ('stripe', 'paddle')),
  customer_id text not null,
  subscription_id text unique,
  plan_id text not null default 'free' references public.plans (id),
  status text not null default 'incomplete',   -- active, trialing, past_due, canceled, unpaid, incomplete...
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  subscribed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspace_subscriptions_plan_idx on public.workspace_subscriptions (plan_id);
create index workspace_subscriptions_subscribed_by_idx on public.workspace_subscriptions (subscribed_by);
create index workspace_subscriptions_customer_idx on public.workspace_subscriptions (customer_id);
create trigger workspace_subscriptions_updated_at before update on public.workspace_subscriptions
  for each row execute function public.set_updated_at();

alter table public.workspace_subscriptions enable row level security;
create policy "subscriptions_select_admin" on public.workspace_subscriptions for select to authenticated
  using (public.has_workspace_role(workspace_id, 'admin'));
create policy "mfa_required" on public.workspace_subscriptions as restrictive for all to authenticated
  using ((select public.mfa_satisfied()));

-- Aplica el estado de una suscripción (webhook). Ignora eventos de una suscripción antigua si ya hay otra activa.
-- Plan efectivo: el de la suscripción si está activa/en prueba/con pago pendiente; si no, 'free'.
create or replace function public.apply_subscription_state(
  p_workspace_id uuid,
  p_provider text,
  p_customer_id text,
  p_subscription_id text,
  p_plan_id text,
  p_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_subscribed_by uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.workspace_subscriptions;
  v_effective text;
  v_old_plan text;
begin
  if not exists (select 1 from public.plans where id = p_plan_id) then
    raise exception 'unknown_plan' using errcode = '22023';
  end if;
  select plan_id into v_old_plan from public.workspaces where id = p_workspace_id for update;
  if v_old_plan is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  select * into v_existing from public.workspace_subscriptions where workspace_id = p_workspace_id;
  if found and v_existing.subscription_id is not null and v_existing.subscription_id <> p_subscription_id
     and v_existing.status in ('active', 'trialing', 'past_due')
     and p_status not in ('active', 'trialing', 'past_due') then
    return v_old_plan;   -- evento tardío de una suscripción ya sustituida
  end if;

  insert into public.workspace_subscriptions as s
    (workspace_id, provider, customer_id, subscription_id, plan_id, status, current_period_end, cancel_at_period_end, subscribed_by)
  values (p_workspace_id, p_provider, p_customer_id, p_subscription_id, p_plan_id, p_status, p_current_period_end,
          coalesce(p_cancel_at_period_end, false), p_subscribed_by)
  on conflict (workspace_id) do update set
    provider = excluded.provider,
    customer_id = excluded.customer_id,
    subscription_id = excluded.subscription_id,
    plan_id = excluded.plan_id,
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    subscribed_by = coalesce(excluded.subscribed_by, s.subscribed_by);

  v_effective := case when p_status in ('active', 'trialing', 'past_due') then p_plan_id else 'free' end;
  if v_effective <> v_old_plan then
    update public.workspaces set plan_id = v_effective where id = p_workspace_id;
    insert into public.activity_log (workspace_id, actor_id, action, entity_type, entity_id, metadata)
    values (p_workspace_id, null, 'plan.changed', 'workspace', p_workspace_id::text,
            jsonb_build_object('from', v_old_plan, 'to', v_effective));
  end if;
  return v_effective;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Afiliados. El afiliado solo ve DATOS AGREGADOS de sus referidos (nunca quién es cada uno).
-- -----------------------------------------------------------------------------
create table public.affiliates (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6,16}$'),
  status text not null default 'active' check (status in ('active', 'suspended')),
  terms_accepted_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Clics agregados por día (sin IP, user agent ni ningún dato personal).
create table public.affiliate_click_stats (
  affiliate_id uuid not null references public.affiliates (user_id) on delete cascade,
  day date not null,
  clicks int not null default 0 check (clicks >= 0),
  primary key (affiliate_id, day)
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (user_id) on delete cascade,
  referred_user_id uuid unique references auth.users (id) on delete set null,
  source text not null check (source in ('cookie', 'declared', 'signup')),
  converted_at timestamptz,
  created_at timestamptz not null default now()
);
create index referrals_affiliate_idx on public.referrals (affiliate_id);

create table public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (user_id) on delete cascade,
  referral_id uuid references public.referrals (id) on delete set null,
  provider_invoice_id text not null unique,          -- idempotencia: una comisión por factura
  net_amount_cents int not null check (net_amount_cents >= 0),
  commission_cents int not null check (commission_cents >= 0),
  rate numeric(5, 4) not null check (rate >= 0 and rate <= 1),
  currency text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'void')),
  paid_at timestamptz,
  paid_reference text check (char_length(paid_reference) <= 200),
  created_at timestamptz not null default now()
);
create index affiliate_commissions_affiliate_idx on public.affiliate_commissions (affiliate_id, created_at desc);
create index affiliate_commissions_referral_idx on public.affiliate_commissions (referral_id);

alter table public.affiliates enable row level security;
alter table public.affiliate_click_stats enable row level security;
alter table public.referrals enable row level security;              -- sin políticas: solo servidor / funciones
alter table public.affiliate_commissions enable row level security;

create policy "affiliates_select_self" on public.affiliates for select to authenticated
  using (user_id = (select auth.uid()));
create policy "affiliate_clicks_select_self" on public.affiliate_click_stats for select to authenticated
  using (affiliate_id = (select auth.uid()));
create policy "affiliate_commissions_select_self" on public.affiliate_commissions for select to authenticated
  using (affiliate_id = (select auth.uid()));
do $$
declare t text;
begin
  foreach t in array array['affiliates', 'affiliate_click_stats', 'referrals', 'affiliate_commissions']
  loop
    execute format('create policy "mfa_required" on public.%I as restrictive for all to authenticated using ((select public.mfa_satisfied()))', t);
  end loop;
end $$;

-- Alta en el programa (acepta los términos). Devuelve el código (idempotente).
create or replace function public.join_affiliate_program()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_code text;
begin
  if v_user is null or not public.mfa_satisfied() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select code into v_code from public.affiliates where user_id = v_user;
  if v_code is not null then
    return v_code;
  end if;
  loop
    v_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
    exit when not exists (select 1 from public.affiliates where code = v_code);
  end loop;
  insert into public.affiliates (user_id, code, terms_accepted_at) values (v_user, v_code, now());
  return v_code;
end;
$$;

-- Clic en /r/<código> (solo servidor). Contador agregado. Devuelve true si el código existe y está activo.
create or replace function public.record_affiliate_click(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_aff uuid;
begin
  select user_id into v_aff from public.affiliates where code = upper(btrim(coalesce(p_code, ''))) and status = 'active';
  if v_aff is null then
    return false;
  end if;
  insert into public.affiliate_click_stats as s (affiliate_id, day, clicks) values (v_aff, current_date, 1)
  on conflict (affiliate_id, day) do update set clicks = s.clicks + 1;
  return true;
end;
$$;

-- Atribuir un registro a un afiliado. Reglas: código activo, sin autorreferidos, una sola atribución por usuario
-- y solo durante los 30 días posteriores al alta de la cuenta (ventana de atribución, provisional).
create or replace function public.attribute_referral(p_user_id uuid, p_code text, p_source text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aff uuid;
  v_created timestamptz;
begin
  select user_id into v_aff from public.affiliates where code = upper(btrim(coalesce(p_code, ''))) and status = 'active';
  if v_aff is null or v_aff = p_user_id then
    return false;
  end if;
  select created_at into v_created from auth.users where id = p_user_id;
  if v_created is null or v_created < now() - interval '30 days' then
    return false;
  end if;
  insert into public.referrals (affiliate_id, referred_user_id, source) values (v_aff, p_user_id, p_source)
  on conflict (referred_user_id) do nothing;
  return found;
end;
$$;

-- El usuario declara quién le recomendó (o el servidor aplica la cookie consentida).
create or replace function public.claim_referral(p_code text, p_source text default 'declared')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.mfa_satisfied() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_source not in ('cookie', 'declared') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return public.attribute_referral((select auth.uid()), p_code, p_source);
end;
$$;

-- Registro con ?ref: si el formulario de alta envía `ref` en los metadatos, se atribuye al crear la cuenta.
-- Nunca bloquea el registro (cualquier error se ignora).
create or replace function public.handle_new_user_referral()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'ref', '') <> '' then
    begin
      perform public.attribute_referral(new.id, new.raw_user_meta_data ->> 'ref', 'signup');
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;
create trigger on_auth_user_created_referral
  after insert on auth.users
  for each row execute function public.handle_new_user_referral();

-- Estadísticas agregadas del afiliado actual.
create or replace function public.my_affiliate_stats()
returns table (clicks bigint, signups bigint, conversions bigint, pending_cents bigint, paid_cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select sum(clicks) from public.affiliate_click_stats where affiliate_id = (select auth.uid())), 0),
    (select count(*) from public.referrals where affiliate_id = (select auth.uid())),
    (select count(*) from public.referrals where affiliate_id = (select auth.uid()) and converted_at is not null),
    coalesce((select sum(commission_cents) from public.affiliate_commissions where affiliate_id = (select auth.uid()) and status = 'pending'), 0),
    coalesce((select sum(commission_cents) from public.affiliate_commissions where affiliate_id = (select auth.uid()) and status = 'paid'), 0)
  where public.mfa_satisfied();
$$;

-- Comisión de una factura pagada (webhook). Idempotente por factura. Sin comisión si: no hay referido,
-- el afiliado está suspendido, es miembro del workspace que paga (autorreferido) o pasó la duración.
create or replace function public.record_commission(
  p_workspace_id uuid,
  p_invoice_id text,
  p_net_cents int,
  p_currency text,
  p_rate numeric,
  p_max_months int
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payer uuid;
  v_ref public.referrals;
  v_commission int;
begin
  if p_net_cents is null or p_net_cents <= 0 or p_rate is null or p_rate <= 0 or p_rate > 1 then
    return 0;
  end if;
  select coalesce(s.subscribed_by, w.created_by) into v_payer
  from public.workspaces w left join public.workspace_subscriptions s on s.workspace_id = w.id
  where w.id = p_workspace_id;
  if v_payer is null then
    return 0;
  end if;

  select r.* into v_ref from public.referrals r join public.affiliates a on a.user_id = r.affiliate_id
  where r.referred_user_id = v_payer and a.status = 'active';
  if not found then
    return 0;
  end if;
  if exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = v_ref.affiliate_id) then
    return 0;
  end if;
  if v_ref.created_at < now() - make_interval(months => greatest(p_max_months, 0)) then
    return 0;
  end if;

  v_commission := floor(p_net_cents * p_rate)::int;
  insert into public.affiliate_commissions
    (affiliate_id, referral_id, provider_invoice_id, net_amount_cents, commission_cents, rate, currency)
  values (v_ref.affiliate_id, v_ref.id, p_invoice_id, p_net_cents, v_commission, p_rate, lower(p_currency))
  on conflict (provider_invoice_id) do nothing;
  update public.referrals set converted_at = coalesce(converted_at, now()) where id = v_ref.id;
  return v_commission;
end;
$$;

-- Reembolso / contracargo: anula la comisión pendiente de esa factura.
create or replace function public.void_commission(p_invoice_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.affiliate_commissions set status = 'void' where provider_invoice_id = p_invoice_id and status = 'pending';
$$;

-- Pago manual (equipo de Kreo, desde el servidor tras comprobar que es staff).
create or replace function public.mark_commission_paid(p_commission_id uuid, p_reference text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.affiliate_commissions
  set status = 'paid', paid_at = now(), paid_reference = nullif(left(btrim(coalesce(p_reference, '')), 200), '')
  where id = p_commission_id and status = 'pending';
$$;

-- -----------------------------------------------------------------------------
-- Permisos de ejecución
-- -----------------------------------------------------------------------------
revoke execute on function public.invitation_hash(text) from public, anon, authenticated;
revoke execute on function public.workspace_member_capacity(uuid) from public, anon;
revoke execute on function public.team_members(uuid) from public, anon;
revoke execute on function public.activity_actors(uuid) from public, anon;
revoke execute on function public.create_invitation(uuid, text, public.workspace_role) from public, anon;
revoke execute on function public.revoke_invitation(uuid) from public, anon;
revoke execute on function public.invitation_preview(text) from public, anon, authenticated;
revoke execute on function public.accept_invitation(text) from public, anon;
revoke execute on function public.change_member_role(uuid, uuid, public.workspace_role) from public, anon;
revoke execute on function public.transfer_ownership(uuid, uuid) from public, anon;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
revoke execute on function public.leave_workspace(uuid) from public, anon;
revoke execute on function public.apply_subscription_state(uuid, text, text, text, text, text, timestamptz, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.join_affiliate_program() from public, anon;
revoke execute on function public.record_affiliate_click(text) from public, anon, authenticated;
revoke execute on function public.attribute_referral(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.claim_referral(text, text) from public, anon;
revoke execute on function public.handle_new_user_referral() from public, anon, authenticated;
revoke execute on function public.my_affiliate_stats() from public, anon;
revoke execute on function public.record_commission(uuid, text, int, text, numeric, int) from public, anon, authenticated;
revoke execute on function public.void_commission(text) from public, anon, authenticated;
revoke execute on function public.mark_commission_paid(uuid, text) from public, anon, authenticated;

grant execute on function public.workspace_member_capacity(uuid) to authenticated, service_role;
grant execute on function public.team_members(uuid) to authenticated;
grant execute on function public.activity_actors(uuid) to authenticated;
grant execute on function public.create_invitation(uuid, text, public.workspace_role) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.change_member_role(uuid, uuid, public.workspace_role) to authenticated;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.leave_workspace(uuid) to authenticated;
grant execute on function public.join_affiliate_program() to authenticated;
grant execute on function public.claim_referral(text, text) to authenticated;
grant execute on function public.my_affiliate_stats() to authenticated;
grant execute on function public.invitation_hash(text) to service_role;
grant execute on function public.invitation_preview(text) to service_role;
grant execute on function public.apply_subscription_state(uuid, text, text, text, text, text, timestamptz, boolean, uuid) to service_role;
grant execute on function public.record_affiliate_click(text) to service_role;
grant execute on function public.attribute_referral(uuid, text, text) to service_role;
grant execute on function public.record_commission(uuid, text, int, text, numeric, int) to service_role;
grant execute on function public.void_commission(text) to service_role;
grant execute on function public.mark_commission_paid(uuid, text) to service_role;
