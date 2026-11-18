-- =============================================================================
-- Kreo · Fase 1 · Esquema base
-- Usuario → Workspaces (roles) → Proyectos → Brand kit · Créditos (saldo + ledger) · Registro de actividad
-- Regla: RLS activado en TODAS las tablas. Las escrituras sensibles solo vía funciones SECURITY DEFINER.
-- =============================================================================

create extension if not exists citext with schema extensions;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.workspace_role as enum ('viewer', 'editor', 'admin', 'owner');

-- -----------------------------------------------------------------------------
-- Planes (estructura lista; precios y límites definitivos más adelante)
-- -----------------------------------------------------------------------------
create table public.plans (
  id text primary key,
  name text not null,
  max_projects int not null,
  max_social_accounts int not null,
  max_members int not null,
  monthly_credits int not null,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

-- Valores PROVISIONALES del plan gratuito (se revisarán con Oier).
insert into public.plans (id, name, max_projects, max_social_accounts, max_members, monthly_credits)
values ('free', 'Free', 2, 3, 1, 50);

-- -----------------------------------------------------------------------------
-- Perfiles (1:1 con auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  avatar_url text,
  locale text not null default 'es' check (locale in ('es', 'en')),
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Workspaces y miembros
-- -----------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  plan_id text not null default 'free' references public.plans (id),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.workspace_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- -----------------------------------------------------------------------------
-- Proyectos / marcas y brand kit
-- -----------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_workspace_idx on public.projects (workspace_id);

create table public.brand_kits (
  project_id uuid primary key references public.projects (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  logo_path text,
  colors jsonb not null default '[]'::jsonb,           -- [{ "name": "Primario", "hex": "#C6F432" }]
  fonts jsonb not null default '[]'::jsonb,            -- [{ "role": "títulos", "family": "Inter" }]
  tone_of_voice text check (char_length(tone_of_voice) <= 2000),
  target_audience text check (char_length(target_audience) <= 2000),
  banned_words text[] not null default '{}',
  example_posts jsonb not null default '[]'::jsonb,    -- [{ "url": "...", "note": "..." }]
  updated_at timestamptz not null default now()
);
create index brand_kits_workspace_idx on public.brand_kits (workspace_id);

-- -----------------------------------------------------------------------------
-- Créditos: saldo + ledger inmutable
-- -----------------------------------------------------------------------------
create table public.credit_balances (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  delta int not null check (delta <> 0),
  balance_after int not null check (balance_after >= 0),
  reason text not null,                     -- 'signup_grant', 'monthly_grant', 'purchase', 'ai_image', 'refund'...
  ref_type text,
  ref_id text,
  idempotency_key text unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index credit_ledger_workspace_idx on public.credit_ledger (workspace_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Registro de actividad (quién hizo qué). Sin datos personales en metadata.
-- -----------------------------------------------------------------------------
create table public.activity_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,                     -- 'project.created', 'brand_kit.updated'...
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_workspace_idx on public.activity_log (workspace_id, created_at desc);

-- =============================================================================
-- Funciones auxiliares
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger workspaces_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger brand_kits_updated_at before update on public.brand_kits
  for each row execute function public.set_updated_at();

-- Rol del usuario actual en un workspace (null si no es miembro).
create or replace function public.workspace_role_of(p_workspace_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.workspace_members m
  where m.workspace_id = p_workspace_id
    and m.user_id = (select auth.uid());
$$;

-- ¿Tiene el usuario actual al menos el rol indicado? (viewer < editor < admin < owner)
create or replace function public.has_workspace_role(p_workspace_id uuid, p_min_role public.workspace_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.workspace_role_of(p_workspace_id) >= p_min_role, false);
$$;

-- ¿Comparten workspace el usuario actual y otro usuario? (para ver perfiles de compañeros)
create or replace function public.shares_workspace_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members a
    join public.workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = (select auth.uid())
      and b.user_id = p_user_id
  );
$$;

-- Registrar actividad (uso interno desde otras funciones SECURITY DEFINER).
create or replace function public.log_activity(
  p_workspace_id uuid,
  p_action text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_workspace_id, (select auth.uid()), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;

-- Perfil automático al registrarse.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, locale)
  values (
    new.id,
    nullif(left(new.raw_user_meta_data ->> 'full_name', 120), ''),
    case when new.raw_user_meta_data ->> 'locale' = 'en' then 'en' else 'es' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Operaciones de negocio (RPC)
-- =============================================================================

-- Crear workspace: el creador queda como owner y recibe los créditos iniciales del plan.
create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_ws uuid;
  v_credits int;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_name is null or char_length(btrim(p_name)) = 0 or char_length(p_name) > 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  insert into public.workspaces (name, created_by) values (btrim(p_name), v_user) returning id into v_ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, v_user, 'owner');

  select monthly_credits into v_credits from public.plans where id = 'free';
  insert into public.credit_balances (workspace_id, balance) values (v_ws, v_credits);
  if v_credits > 0 then
    insert into public.credit_ledger (workspace_id, delta, balance_after, reason, idempotency_key, created_by)
    values (v_ws, v_credits, v_credits, 'signup_grant', 'signup_grant:' || v_ws, v_user);
  end if;

  perform public.log_activity(v_ws, 'workspace.created', 'workspace', v_ws::text);
  return v_ws;
end;
$$;

-- Crear proyecto respetando el límite del plan (admin o superior).
create or replace function public.create_project(p_workspace_id uuid, p_name text, p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_max int;
  v_count int;
  v_project uuid;
begin
  if not public.has_workspace_role(p_workspace_id, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) = 0 or char_length(p_name) > 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  -- Bloquea el workspace para que dos creaciones simultáneas no superen el límite.
  select p.max_projects into v_max
  from public.workspaces w join public.plans p on p.id = w.plan_id
  where w.id = p_workspace_id
  for update of w;

  select count(*) into v_count from public.projects
  where workspace_id = p_workspace_id and archived_at is null;

  if v_count >= v_max then
    raise exception 'plan_limit_projects' using errcode = 'P0001';
  end if;

  insert into public.projects (workspace_id, name, description, created_by)
  values (p_workspace_id, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), v_user)
  returning id into v_project;

  insert into public.brand_kits (project_id, workspace_id) values (v_project, p_workspace_id);

  perform public.log_activity(p_workspace_id, 'project.created', 'project', v_project::text);
  return v_project;
end;
$$;

-- Consumir créditos de forma ATÓMICA e IDEMPOTENTE (editor o superior).
-- Devuelve el saldo resultante. Si la misma idempotency_key ya se aplicó, no cobra dos veces.
create or replace function public.consume_credits(
  p_workspace_id uuid,
  p_amount int,
  p_reason text,
  p_idempotency_key text,
  p_ref_type text default null,
  p_ref_id text default null
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance int;
  v_existing int;
begin
  if not public.has_workspace_role(p_workspace_id, 'editor') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) = 0 then
    raise exception 'missing_idempotency_key' using errcode = '22023';
  end if;

  select balance_after into v_existing from public.credit_ledger
  where idempotency_key = p_idempotency_key and workspace_id = p_workspace_id;
  if found then
    return v_existing;
  end if;

  select balance into v_balance from public.credit_balances
  where workspace_id = p_workspace_id
  for update;

  if v_balance is null or v_balance < p_amount then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  v_balance := v_balance - p_amount;
  update public.credit_balances set balance = v_balance, updated_at = now() where workspace_id = p_workspace_id;
  insert into public.credit_ledger (workspace_id, delta, balance_after, reason, ref_type, ref_id, idempotency_key, created_by)
  values (p_workspace_id, -p_amount, v_balance, p_reason, p_ref_type, p_ref_id, p_idempotency_key, (select auth.uid()));

  return v_balance;
end;
$$;

-- Añadir créditos (compras, cuota mensual, reembolsos). SOLO servidor (service_role), nunca desde el navegador.
create or replace function public.grant_credits(
  p_workspace_id uuid,
  p_amount int,
  p_reason text,
  p_idempotency_key text,
  p_ref_type text default null,
  p_ref_id text default null
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance int;
  v_existing int;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  select balance_after into v_existing from public.credit_ledger
  where idempotency_key = p_idempotency_key and workspace_id = p_workspace_id;
  if found then
    return v_existing;
  end if;

  insert into public.credit_balances (workspace_id, balance) values (p_workspace_id, 0)
  on conflict (workspace_id) do nothing;

  select balance into v_balance from public.credit_balances where workspace_id = p_workspace_id for update;
  v_balance := v_balance + p_amount;
  update public.credit_balances set balance = v_balance, updated_at = now() where workspace_id = p_workspace_id;
  insert into public.credit_ledger (workspace_id, delta, balance_after, reason, ref_type, ref_id, idempotency_key)
  values (p_workspace_id, p_amount, v_balance, p_reason, p_ref_type, p_ref_id, p_idempotency_key);
  return v_balance;
end;
$$;

-- Permisos de ejecución: nada para anon; grant_credits y log_activity solo service_role.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.workspace_role_of(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, public.workspace_role) to authenticated;
grant execute on function public.shares_workspace_with(uuid) to authenticated;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.create_project(uuid, text, text) to authenticated;
grant execute on function public.consume_credits(uuid, int, text, text, text, text) to authenticated;
revoke execute on function public.grant_credits(uuid, int, text, text, text, text) from authenticated;
revoke execute on function public.log_activity(uuid, text, text, text, jsonb) from authenticated;
grant execute on function public.grant_credits(uuid, int, text, text, text, text) to service_role;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.brand_kits enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.activity_log enable row level security;

-- plans: lectura para usuarios autenticados.
create policy "plans_select" on public.plans for select to authenticated using (true);

-- profiles
create policy "profiles_select_self_or_teammates" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_workspace_with(id));
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- workspaces (crear solo vía create_workspace)
create policy "workspaces_select_member" on public.workspaces for select to authenticated
  using (public.has_workspace_role(id, 'viewer'));
create policy "workspaces_update_admin" on public.workspaces for update to authenticated
  using (public.has_workspace_role(id, 'admin')) with check (public.has_workspace_role(id, 'admin'));
create policy "workspaces_delete_owner" on public.workspaces for delete to authenticated
  using (public.has_workspace_role(id, 'owner'));

-- workspace_members (gestión de equipo llegará en Fase 4 vía funciones)
create policy "members_select_member" on public.workspace_members for select to authenticated
  using (public.has_workspace_role(workspace_id, 'viewer'));

-- projects (crear solo vía create_project)
create policy "projects_select_member" on public.projects for select to authenticated
  using (public.has_workspace_role(workspace_id, 'viewer'));
create policy "projects_update_admin" on public.projects for update to authenticated
  using (public.has_workspace_role(workspace_id, 'admin')) with check (public.has_workspace_role(workspace_id, 'admin'));
create policy "projects_delete_admin" on public.projects for delete to authenticated
  using (public.has_workspace_role(workspace_id, 'admin'));

-- brand_kits
create policy "brand_kits_select_member" on public.brand_kits for select to authenticated
  using (public.has_workspace_role(workspace_id, 'viewer'));
create policy "brand_kits_update_editor" on public.brand_kits for update to authenticated
  using (public.has_workspace_role(workspace_id, 'editor')) with check (public.has_workspace_role(workspace_id, 'editor'));

-- créditos: solo lectura para miembros; escrituras solo vía funciones
create policy "credit_balances_select_member" on public.credit_balances for select to authenticated
  using (public.has_workspace_role(workspace_id, 'viewer'));
create policy "credit_ledger_select_member" on public.credit_ledger for select to authenticated
  using (public.has_workspace_role(workspace_id, 'viewer'));

-- activity_log: solo admins leen
create policy "activity_log_select_admin" on public.activity_log for select to authenticated
  using (public.has_workspace_role(workspace_id, 'admin'));

-- brand_kits.workspace_id debe coincidir con el del proyecto (evita mover un kit a otro workspace)
create or replace function public.brand_kit_workspace_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id <> old.workspace_id or new.project_id <> old.project_id then
    raise exception 'immutable_columns' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger brand_kits_guard before update on public.brand_kits
  for each row execute function public.brand_kit_workspace_guard();

-- projects.workspace_id inmutable
create or replace function public.project_workspace_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id <> old.workspace_id then
    raise exception 'immutable_columns' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger projects_guard before update on public.projects
  for each row execute function public.project_workspace_guard();

-- workspaces.plan_id solo lo cambia el servidor (Stripe), no el usuario
create or replace function public.workspace_plan_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plan_id <> old.plan_id and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'plan_change_forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger workspaces_plan_guard before update on public.workspaces
  for each row execute function public.workspace_plan_guard();

-- =============================================================================
-- Storage: bucket privado para assets de marca. Ruta: {workspace_id}/{project_id}/{archivo}
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-assets', 'brand-assets', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "brand_assets_select_member" on storage.objects for select to authenticated
  using (bucket_id = 'brand-assets' and public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'viewer'));
create policy "brand_assets_insert_editor" on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-assets' and public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'editor'));
create policy "brand_assets_update_editor" on storage.objects for update to authenticated
  using (bucket_id = 'brand-assets' and public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'editor'));
create policy "brand_assets_delete_editor" on storage.objects for delete to authenticated
  using (bucket_id = 'brand-assets' and public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'editor'));
