-- =============================================================================
-- Kreo · Fase 1 · Cuentas sociales, publicaciones (con aprobación y límites anti-baneo),
-- métricas, generaciones de IA y biblioteca de assets. + 2FA exigido también en la base de datos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2FA a nivel de base de datos: si el usuario tiene un factor verificado, su sesión debe ser aal2.
-- -----------------------------------------------------------------------------
create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
      or not exists (select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified');
$$;
revoke execute on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['profiles','workspaces','workspace_members','projects','brand_kits','credit_balances','credit_ledger','activity_log']
  loop
    execute format('create policy "mfa_required" on public.%I as restrictive for all to authenticated using ((select public.mfa_satisfied()))', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.social_platform as enum ('tiktok', 'instagram', 'youtube');
create type public.connection_status as enum ('active', 'expired', 'missing_scopes', 'revoked', 'error');
create type public.post_status as enum (
  'draft', 'pending_approval', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'
);

-- Límite diario por defecto (conservador) y máximo configurable por plataforma.
create or replace function public.platform_default_daily_limit(p public.social_platform)
returns int language sql immutable set search_path = '' as $$
  select case p when 'tiktok' then 3 when 'instagram' then 5 when 'youtube' then 3 end;
$$;
create or replace function public.platform_max_daily_limit(p public.social_platform)
returns int language sql immutable set search_path = '' as $$
  select case p when 'tiktok' then 10 when 'instagram' then 25 when 'youtube' then 10 end;
$$;

-- -----------------------------------------------------------------------------
-- Cuentas sociales (datos públicos de la conexión). Los TOKENS van en otra tabla sin acceso para usuarios.
-- -----------------------------------------------------------------------------
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  platform public.social_platform not null,
  external_id text not null,
  handle text,
  display_name text,
  avatar_url text,
  status public.connection_status not null default 'active',
  granted_scopes text[] not null default '{}',
  missing_scopes text[] not null default '{}',
  daily_post_limit int not null,
  metadata jsonb not null default '{}'::jsonb,
  connected_by uuid references auth.users (id) on delete set null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, platform, external_id),
  check (daily_post_limit >= 1 and daily_post_limit <= public.platform_max_daily_limit(platform))
);
create index social_accounts_workspace_idx on public.social_accounts (workspace_id);
create index social_accounts_project_idx on public.social_accounts (project_id);
create index social_accounts_connected_by_idx on public.social_accounts (connected_by);
create trigger social_accounts_updated_at before update on public.social_accounts
  for each row execute function public.set_updated_at();

-- Tokens cifrados en la aplicación (AES-256-GCM). RLS sin políticas: solo service_role.
create table public.social_account_tokens (
  social_account_id uuid primary key references public.social_accounts (id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Assets (biblioteca de medios por proyecto) y generaciones de IA
-- -----------------------------------------------------------------------------
create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'audio', 'music', 'text')),
  provider text not null,
  model text not null,
  prompt text not null check (char_length(prompt) <= 4000),
  params jsonb not null default '{}'::jsonb,
  credits_cost int not null check (credits_cost >= 0),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'refunded')),
  provider_request_id text,
  error_code text,
  license jsonb not null default '{}'::jsonb,   -- condiciones de uso comercial del modelo
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index ai_generations_project_idx on public.ai_generations (project_id, created_at desc);
create index ai_generations_workspace_idx on public.ai_generations (workspace_id);
create index ai_generations_created_by_idx on public.ai_generations (created_by);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint,
  width int,
  height int,
  duration_seconds numeric,
  source text not null check (source in ('upload', 'ai')),
  ai_generated boolean not null default false,       -- etiqueta interna "generado con IA" (se arrastra a la publicación)
  generation_id uuid references public.ai_generations (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (source <> 'ai' or ai_generated)
);
create index assets_project_idx on public.assets (project_id, created_at desc);
create index assets_workspace_idx on public.assets (workspace_id);
create index assets_generation_idx on public.assets (generation_id);
create index assets_created_by_idx on public.assets (created_by);

-- -----------------------------------------------------------------------------
-- Publicaciones
-- -----------------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text check (char_length(title) <= 120),
  caption text not null default '' check (char_length(caption) <= 5000),
  asset_ids uuid[] not null default '{}',
  ai_generated boolean not null default false,
  status public.post_status not null default 'draft',
  scheduled_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_project_sched_idx on public.posts (project_id, scheduled_at);
create index posts_workspace_sched_idx on public.posts (workspace_id, scheduled_at);
create index posts_status_sched_idx on public.posts (status, scheduled_at);
create index posts_created_by_idx on public.posts (created_by);
create index posts_approved_by_idx on public.posts (approved_by);
create trigger posts_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

-- Un destino por cuenta social, con caption adaptado y opciones de la plataforma.
create table public.post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  caption_override text check (char_length(caption_override) <= 5000),
  platform_options jsonb not null default '{}'::jsonb,   -- p. ej. TikTok: privacy_level, disable_comment, brand_content_toggle
  status public.post_status not null default 'draft',
  external_post_id text,
  external_url text,
  error_code text,
  attempts int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, social_account_id)
);
create index post_targets_account_idx on public.post_targets (social_account_id, published_at);
create index post_targets_workspace_idx on public.post_targets (workspace_id);
create trigger post_targets_updated_at before update on public.post_targets
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Métricas (snapshots). Datos AUTORIZADOS de las propias cuentas del usuario.
-- -----------------------------------------------------------------------------
create table public.account_metrics_daily (
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  day date not null,
  followers bigint,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  posts_count bigint,
  captured_at timestamptz not null default now(),
  primary key (social_account_id, day)
);
create index account_metrics_workspace_idx on public.account_metrics_daily (workspace_id, day);

create table public.post_metrics (
  post_target_id uuid not null references public.post_targets (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  captured_at timestamptz not null default now(),
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  primary key (post_target_id, captured_at)
);
create index post_metrics_workspace_idx on public.post_metrics (workspace_id);

-- =============================================================================
-- Coherencia: el workspace_id de las filas hijas debe coincidir con el del proyecto/post.
-- =============================================================================
create or replace function public.enforce_project_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.workspace_id = new.workspace_id) then
    raise exception 'workspace_mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger social_accounts_ws before insert or update of workspace_id, project_id on public.social_accounts
  for each row execute function public.enforce_project_workspace();
create trigger ai_generations_ws before insert or update of workspace_id, project_id on public.ai_generations
  for each row execute function public.enforce_project_workspace();
create trigger assets_ws before insert or update of workspace_id, project_id on public.assets
  for each row execute function public.enforce_project_workspace();
create trigger posts_ws before insert or update of workspace_id, project_id on public.posts
  for each row execute function public.enforce_project_workspace();

create or replace function public.enforce_target_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.posts p join public.social_accounts a on a.project_id = p.project_id
    where p.id = new.post_id and a.id = new.social_account_id and p.workspace_id = new.workspace_id
  ) then
    raise exception 'workspace_mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger post_targets_ws before insert or update of workspace_id, post_id, social_account_id on public.post_targets
  for each row execute function public.enforce_target_workspace();

-- Los usuarios solo pueden mover un post entre draft / pending_approval / cancelled.
-- approved / scheduled solo vía approve_post(); publishing / published / failed solo el servidor.
create or replace function public.guard_post_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_setting('kreo.allow_status', true) = 'on' then
    return new;
  end if;
  if new.status is distinct from old.status and new.status not in ('draft', 'pending_approval', 'cancelled') then
    raise exception 'status_change_forbidden' using errcode = '42501';
  end if;
  if old.status in ('publishing', 'published') then
    raise exception 'post_locked' using errcode = '42501';
  end if;
  -- Editar un post aprobado/programado lo devuelve a borrador (hay que volver a aprobarlo).
  if old.status in ('approved', 'scheduled') and new.status = old.status
     and (new.caption is distinct from old.caption or new.asset_ids is distinct from old.asset_ids
          or new.scheduled_at is distinct from old.scheduled_at) then
    new.status := 'pending_approval';
    new.approved_by := null;
    new.approved_at := null;
  end if;
  if new.approved_by is distinct from old.approved_by and new.status not in ('approved', 'scheduled') then
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end;
$$;
create trigger posts_status_guard before update on public.posts
  for each row execute function public.guard_post_status();

create or replace function public.guard_target_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_setting('kreo.allow_status', true) = 'on' then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.external_post_id is distinct from old.external_post_id
     or new.published_at is distinct from old.published_at
     or new.attempts is distinct from old.attempts then
    raise exception 'status_change_forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger post_targets_status_guard before update on public.post_targets
  for each row execute function public.guard_target_status();

-- =============================================================================
-- Funciones de negocio
-- =============================================================================

-- Alta / reconexión de una cuenta social tras el OAuth (rol editor+, límite del plan).
-- Los tokens los guarda después el servidor con service_role en social_account_tokens.
create or replace function public.upsert_social_account(
  p_project_id uuid,
  p_platform public.social_platform,
  p_external_id text,
  p_handle text,
  p_display_name text,
  p_avatar_url text,
  p_granted_scopes text[],
  p_missing_scopes text[],
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws uuid;
  v_id uuid;
  v_max int;
  v_count int;
begin
  select workspace_id into v_ws from public.projects where id = p_project_id and archived_at is null;
  if v_ws is null or not public.has_workspace_role(v_ws, 'editor') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select id into v_id from public.social_accounts
  where project_id = p_project_id and platform = p_platform and external_id = p_external_id;

  if v_id is null then
    select p.max_social_accounts into v_max from public.workspaces w join public.plans p on p.id = w.plan_id
    where w.id = v_ws for update of w;
    select count(*) into v_count from public.social_accounts where workspace_id = v_ws;
    if v_count >= v_max then
      raise exception 'plan_limit_accounts' using errcode = 'P0001';
    end if;
    insert into public.social_accounts (
      workspace_id, project_id, platform, external_id, handle, display_name, avatar_url, status,
      granted_scopes, missing_scopes, daily_post_limit, metadata, connected_by
    ) values (
      v_ws, p_project_id, p_platform, p_external_id, left(p_handle, 120), left(p_display_name, 200), p_avatar_url,
      case when coalesce(array_length(p_missing_scopes, 1), 0) > 0 then 'missing_scopes' else 'active' end,
      coalesce(p_granted_scopes, '{}'), coalesce(p_missing_scopes, '{}'),
      public.platform_default_daily_limit(p_platform), coalesce(p_metadata, '{}'::jsonb), (select auth.uid())
    ) returning id into v_id;
    perform public.log_activity(v_ws, 'social_account.connected', 'social_account', v_id::text, jsonb_build_object('platform', p_platform));
  else
    update public.social_accounts set
      handle = left(p_handle, 120), display_name = left(p_display_name, 200), avatar_url = p_avatar_url,
      granted_scopes = coalesce(p_granted_scopes, '{}'), missing_scopes = coalesce(p_missing_scopes, '{}'),
      status = case when coalesce(array_length(p_missing_scopes, 1), 0) > 0 then 'missing_scopes' else 'active' end,
      metadata = coalesce(p_metadata, '{}'::jsonb), connected_by = (select auth.uid())
    where id = v_id;
    perform public.log_activity(v_ws, 'social_account.reconnected', 'social_account', v_id::text, jsonb_build_object('platform', p_platform));
  end if;
  return v_id;
end;
$$;

-- Enviar a aprobación (editor+).
create or replace function public.submit_post(p_post_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  select workspace_id into v_ws from public.posts where id = p_post_id and status = 'draft';
  if v_ws is null or not public.has_workspace_role(v_ws, 'editor') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.post_targets where post_id = p_post_id) then
    raise exception 'no_targets' using errcode = 'P0001';
  end if;
  perform set_config('kreo.allow_status', 'on', true);
  update public.posts set status = 'pending_approval' where id = p_post_id;
  update public.post_targets set status = 'pending_approval' where post_id = p_post_id;
  perform set_config('kreo.allow_status', 'off', true);
  perform public.log_activity(v_ws, 'post.submitted', 'post', p_post_id::text);
end;
$$;

-- Comprobación anti-baneo: publicaciones del mismo día por cuenta frente a su límite.
-- Devuelve las cuentas que lo superarían.
create or replace function public.post_limit_violations(p_post_id uuid)
returns table (social_account_id uuid, handle text, day date, planned bigint, daily_limit int)
language sql stable security definer set search_path = '' as $$
  with me as (select scheduled_at, workspace_id from public.posts where id = p_post_id)
  select a.id, a.handle, (me.scheduled_at at time zone 'UTC')::date,
         (select count(*) from public.post_targets t2 join public.posts p2 on p2.id = t2.post_id
           where t2.social_account_id = a.id and p2.id <> p_post_id
             and p2.status in ('approved', 'scheduled', 'publishing', 'published')
             and (p2.scheduled_at at time zone 'UTC')::date = (me.scheduled_at at time zone 'UTC')::date) + 1,
         a.daily_post_limit
  from me
  join public.post_targets t on t.post_id = p_post_id
  join public.social_accounts a on a.id = t.social_account_id
  where public.has_workspace_role(me.workspace_id, 'viewer')
    and me.scheduled_at is not null
    and (select count(*) from public.post_targets t2 join public.posts p2 on p2.id = t2.post_id
          where t2.social_account_id = a.id and p2.id <> p_post_id
            and p2.status in ('approved', 'scheduled', 'publishing', 'published')
            and (p2.scheduled_at at time zone 'UTC')::date = (me.scheduled_at at time zone 'UTC')::date) + 1 > a.daily_post_limit;
$$;

-- Aprobar (admin+). Con fecha → 'scheduled' (lo publicará el worker); sin fecha → 'approved'.
-- Aprobación humana obligatoria: este es el ÚNICO camino hacia la publicación.
create or replace function public.approve_post(p_post_id uuid)
returns public.post_status language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid;
  v_sched timestamptz;
  v_status public.post_status;
begin
  select workspace_id, scheduled_at into v_ws, v_sched from public.posts
  where id = p_post_id and status in ('pending_approval', 'draft') for update;
  if v_ws is null or not public.has_workspace_role(v_ws, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.post_targets where post_id = p_post_id) then
    raise exception 'no_targets' using errcode = 'P0001';
  end if;
  if v_sched is not null and v_sched < now() - interval '5 minutes' then
    raise exception 'scheduled_in_past' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.post_limit_violations(p_post_id)) then
    raise exception 'daily_limit_exceeded' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.post_targets t join public.social_accounts a on a.id = t.social_account_id
    where t.post_id = p_post_id and a.status <> 'active'
  ) then
    raise exception 'account_not_active' using errcode = 'P0001';
  end if;

  v_status := case when v_sched is null then 'approved' else 'scheduled' end;
  perform set_config('kreo.allow_status', 'on', true);
  update public.posts set status = v_status, approved_by = (select auth.uid()), approved_at = now() where id = p_post_id;
  update public.post_targets set status = v_status where post_id = p_post_id;
  perform set_config('kreo.allow_status', 'off', true);
  perform public.log_activity(v_ws, 'post.approved', 'post', p_post_id::text);
  return v_status;
end;
$$;

-- Volver a borrador / cancelar (editor+), siempre que no se esté publicando.
create or replace function public.unschedule_post(p_post_id uuid, p_cancel boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  select workspace_id into v_ws from public.posts
  where id = p_post_id and status in ('draft', 'pending_approval', 'approved', 'scheduled', 'failed') for update;
  if v_ws is null or not public.has_workspace_role(v_ws, 'editor') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform set_config('kreo.allow_status', 'on', true);
  update public.posts set status = case when p_cancel then 'cancelled'::public.post_status else 'draft'::public.post_status end,
    approved_by = null, approved_at = null where id = p_post_id;
  update public.post_targets set status = case when p_cancel then 'cancelled'::public.post_status else 'draft'::public.post_status end,
    error_code = null where post_id = p_post_id and status <> 'published';
  perform set_config('kreo.allow_status', 'off', true);
  perform public.log_activity(v_ws, case when p_cancel then 'post.cancelled' else 'post.unscheduled' end, 'post', p_post_id::text);
end;
$$;

-- Permisos
revoke execute on function public.platform_default_daily_limit(public.social_platform) from public, anon;
revoke execute on function public.platform_max_daily_limit(public.social_platform) from public, anon;
revoke execute on function public.enforce_project_workspace() from public, anon, authenticated;
revoke execute on function public.enforce_target_workspace() from public, anon, authenticated;
revoke execute on function public.guard_post_status() from public, anon, authenticated;
revoke execute on function public.guard_target_status() from public, anon, authenticated;
revoke execute on function public.upsert_social_account(uuid, public.social_platform, text, text, text, text, text[], text[], jsonb) from public, anon;
revoke execute on function public.submit_post(uuid) from public, anon;
revoke execute on function public.post_limit_violations(uuid) from public, anon;
revoke execute on function public.approve_post(uuid) from public, anon;
revoke execute on function public.unschedule_post(uuid, boolean) from public, anon;
grant execute on function public.platform_default_daily_limit(public.social_platform) to authenticated;
grant execute on function public.platform_max_daily_limit(public.social_platform) to authenticated;
grant execute on function public.upsert_social_account(uuid, public.social_platform, text, text, text, text, text[], text[], jsonb) to authenticated;
grant execute on function public.submit_post(uuid) to authenticated;
grant execute on function public.post_limit_violations(uuid) to authenticated;
grant execute on function public.approve_post(uuid) to authenticated;
grant execute on function public.unschedule_post(uuid, boolean) to authenticated;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.social_accounts enable row level security;
alter table public.social_account_tokens enable row level security;   -- sin políticas: solo service_role
alter table public.ai_generations enable row level security;
alter table public.assets enable row level security;
alter table public.posts enable row level security;
alter table public.post_targets enable row level security;
alter table public.account_metrics_daily enable row level security;
alter table public.post_metrics enable row level security;

-- social_accounts: ver (viewer), ajustar límite / desconectar (admin). Alta solo vía upsert_social_account.
create policy "social_accounts_select" on public.social_accounts for select to authenticated
  using (public.has_workspace_role(workspace_id, 'viewer'));
create policy "social_accounts_update_admin" on public.social_accounts for update to authenticated
  using (public.has_workspace_role(workspace_id, 'admin')) with check (public.has_workspace_role(workspace_id, 'admin'));
create policy "social_accounts_delete_admin" on public.social_accounts for delete to authenticated
  using (public.has_workspace_role(workspace_id, 'admin'));

-- ai_generations y assets: lectura viewer; escritura editor (los cargos de créditos van por consume_credits).
create policy "ai_generations_select" on public.ai_generations for select to authenticated
  using (public.has_workspace_role(workspace_id, 'viewer'));
create policy "assets_select" on public.assets for select to authenticated
  using (public.has_workspace_role(workspace_id, 'viewer'));
create policy "assets_insert_editor" on public.assets for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'editor') and source = 'upload' and created_by = (select auth.uid()));
create policy "assets_delete_editor" on public.assets for delete to authenticated
  using (public.has_workspace_role(workspace_id, 'editor'));

-- posts y post_targets: lectura viewer; crear/editar editor (los guards limitan los estados).
create policy "posts_select" on public.posts for select to authenticated
  using (public.has_workspace_role(workspace_id, 'viewer'));
create policy "posts_insert_editor" on public.posts for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'editor') and status = 'draft' and approved_by is null and created_by = (select auth.uid()));
create policy "posts_update_editor" on public.posts for update to authenticated
  using (public.has_workspace_role(workspace_id, 'editor')) with check (public.has_workspace_role(workspace_id, 'editor'));
create policy "posts_delete_editor" on public.posts for delete to authenticated
  using (public.has_workspace_role(workspace_id, 'editor') and status in ('draft', 'pending_approval', 'cancelled', 'failed'));

create policy "post_targets_select" on public.post_targets for select to authenticated
  using (public.has_workspace_role(workspace_id, 'viewer'));
create policy "post_targets_insert_editor" on public.post_targets for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'editor') and status = 'draft' and external_post_id is null);
create policy "post_targets_update_editor" on public.post_targets for update to authenticated
  using (public.has_workspace_role(workspace_id, 'editor')) with check (public.has_workspace_role(workspace_id, 'editor'));
create policy "post_targets_delete_editor" on public.post_targets for delete to authenticated
  using (public.has_workspace_role(workspace_id, 'editor') and status in ('draft', 'pending_approval', 'cancelled', 'failed'));

-- métricas: solo lectura
create policy "account_metrics_select" on public.account_metrics_daily for select to authenticated
  using (public.has_workspace_role(workspace_id, 'viewer'));
create policy "post_metrics_select" on public.post_metrics for select to authenticated
  using (public.has_workspace_role(workspace_id, 'viewer'));

do $$
declare t text;
begin
  foreach t in array array['social_accounts','ai_generations','assets','posts','post_targets','account_metrics_daily','post_metrics']
  loop
    execute format('create policy "mfa_required" on public.%I as restrictive for all to authenticated using ((select public.mfa_satisfied()))', t);
  end loop;
end $$;

-- =============================================================================
-- Storage: medios de proyecto (subidas y generados por IA). Ruta: {workspace_id}/{project_id}/{archivo}
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-media', 'project-media', false, 52428800,
        array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/wav'])
on conflict (id) do nothing;

create policy "project_media_select_member" on storage.objects for select to authenticated
  using (bucket_id = 'project-media' and public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'viewer'));
create policy "project_media_insert_editor" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-media' and public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'editor'));
create policy "project_media_delete_editor" on storage.objects for delete to authenticated
  using (bucket_id = 'project-media' and public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'editor'));
