-- =============================================================================
-- Kreo · Plantillas de publicación, series y textos guardados (grupos de hashtags / textos).
--  - post_templates: texto base con huecos {tema}, hashtags, cuentas, opciones por red y hora preferida.
--    Por las Content Sharing Guidelines de TikTok NO se guardan privacidad ni interacciones de TikTok
--    (el usuario las elige en cada publicación); lo garantiza el servidor al guardar.
--  - post_snippets: conjuntos con nombre que se insertan en el editor con un clic.
--  - post_series: registro de cada serie creada desde una plantilla; las publicaciones llevan posts.series_id.
--    Una serie solo crea BORRADORES o PENDIENTES DE APROBACIÓN: la aprobación sigue siendo humana (approve_post).
-- RLS: lectura viewer, escritura editor y política restrictiva de 2FA en todas las tablas nuevas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Plantillas
-- -----------------------------------------------------------------------------
create table public.post_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  title text check (char_length(title) <= 120),
  caption text not null default '' check (char_length(caption) <= 5000),
  hashtags text[] not null default '{}' check (cardinality(hashtags) <= 60),
  social_account_ids uuid[] not null default '{}' check (cardinality(social_account_ids) <= 20),
  -- Opciones por red ({ "youtube": {...} }). Nunca opciones de TikTok (ver cabecera).
  platform_options jsonb not null default '{}'::jsonb
    check (jsonb_typeof(platform_options) = 'object' and pg_column_size(platform_options) <= 8192 and not (platform_options ? 'tiktok')),
  preferred_time text check (preferred_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index post_templates_name_idx on public.post_templates (project_id, lower(btrim(name)));
create index post_templates_workspace_idx on public.post_templates (workspace_id);
create index post_templates_created_by_idx on public.post_templates (created_by);
create trigger post_templates_updated_at before update on public.post_templates
  for each row execute function public.set_updated_at();
create trigger post_templates_ws before insert or update of workspace_id, project_id on public.post_templates
  for each row execute function public.enforce_project_workspace();

-- Las cuentas de una plantilla deben ser del mismo proyecto.
create or replace function public.enforce_template_accounts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from unnest(new.social_account_ids) as x(id)
    where not exists (select 1 from public.social_accounts a where a.id = x.id and a.project_id = new.project_id)
  ) then
    raise exception 'workspace_mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger post_templates_accounts before insert or update of social_account_ids, project_id on public.post_templates
  for each row execute function public.enforce_template_accounts();

-- -----------------------------------------------------------------------------
-- Textos guardados: grupos de hashtags y textos (CTA, firmas…)
-- -----------------------------------------------------------------------------
create table public.post_snippets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('hashtags', 'text')),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  content text not null check (char_length(content) between 1 and 2200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index post_snippets_name_idx on public.post_snippets (project_id, kind, lower(btrim(name)));
create index post_snippets_workspace_idx on public.post_snippets (workspace_id);
create index post_snippets_created_by_idx on public.post_snippets (created_by);
create trigger post_snippets_updated_at before update on public.post_snippets
  for each row execute function public.set_updated_at();
create trigger post_snippets_ws before insert or update of workspace_id, project_id on public.post_snippets
  for each row execute function public.enforce_project_workspace();

-- -----------------------------------------------------------------------------
-- Series (programar N publicaciones con una recurrencia a partir de una plantilla)
-- -----------------------------------------------------------------------------
create table public.post_series (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  template_id uuid references public.post_templates (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  recurrence jsonb not null check (jsonb_typeof(recurrence) = 'object' and pg_column_size(recurrence) <= 2048),
  timezone text not null default 'Europe/Madrid' check (char_length(timezone) <= 64),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index post_series_project_idx on public.post_series (project_id, created_at desc);
create index post_series_workspace_idx on public.post_series (workspace_id);
create index post_series_template_idx on public.post_series (template_id);
create index post_series_created_by_idx on public.post_series (created_by);
create trigger post_series_ws before insert or update of workspace_id, project_id on public.post_series
  for each row execute function public.enforce_project_workspace();

alter table public.posts add column series_id uuid references public.post_series (id) on delete set null;
create index posts_series_idx on public.posts (series_id) where series_id is not null;

-- La serie de un post debe ser del mismo proyecto.
create or replace function public.enforce_post_series()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.series_id is not null and not exists (
    select 1 from public.post_series s where s.id = new.series_id and s.project_id = new.project_id
  ) then
    raise exception 'workspace_mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger posts_series_guard before insert or update of series_id, project_id on public.posts
  for each row execute function public.enforce_post_series();

-- Enviar varias publicaciones a aprobación de una vez (evita N llamadas). Reutiliza submit_post, que comprueba
-- el rol (editor+), el estado (borrador) y que haya destinos. NO aprueba: eso sigue siendo approve_post (admin, humano).
create or replace function public.submit_posts(p_post_ids uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_n int := 0;
begin
  if p_post_ids is null or cardinality(p_post_ids) > 60 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  foreach v_id in array p_post_ids loop
    perform public.submit_post(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.enforce_template_accounts() from public, anon, authenticated;
revoke execute on function public.enforce_post_series() from public, anon, authenticated;
revoke execute on function public.submit_posts(uuid[]) from public, anon;
grant execute on function public.submit_posts(uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.post_templates enable row level security;
alter table public.post_snippets enable row level security;
alter table public.post_series enable row level security;

create policy "post_templates_select" on public.post_templates for select to authenticated
  using ((select public.has_workspace_role(workspace_id, 'viewer')));
create policy "post_templates_insert_editor" on public.post_templates for insert to authenticated
  with check ((select public.has_workspace_role(workspace_id, 'editor')) and created_by = (select auth.uid()));
create policy "post_templates_update_editor" on public.post_templates for update to authenticated
  using ((select public.has_workspace_role(workspace_id, 'editor'))) with check ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "post_templates_delete_editor" on public.post_templates for delete to authenticated
  using ((select public.has_workspace_role(workspace_id, 'editor')));

create policy "post_snippets_select" on public.post_snippets for select to authenticated
  using ((select public.has_workspace_role(workspace_id, 'viewer')));
create policy "post_snippets_insert_editor" on public.post_snippets for insert to authenticated
  with check ((select public.has_workspace_role(workspace_id, 'editor')) and created_by = (select auth.uid()));
create policy "post_snippets_update_editor" on public.post_snippets for update to authenticated
  using ((select public.has_workspace_role(workspace_id, 'editor'))) with check ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "post_snippets_delete_editor" on public.post_snippets for delete to authenticated
  using ((select public.has_workspace_role(workspace_id, 'editor')));

create policy "post_series_select" on public.post_series for select to authenticated
  using ((select public.has_workspace_role(workspace_id, 'viewer')));
create policy "post_series_insert_editor" on public.post_series for insert to authenticated
  with check ((select public.has_workspace_role(workspace_id, 'editor')) and created_by = (select auth.uid()));
create policy "post_series_delete_editor" on public.post_series for delete to authenticated
  using ((select public.has_workspace_role(workspace_id, 'editor')));

do $$
declare t text;
begin
  foreach t in array array['post_templates', 'post_snippets', 'post_series']
  loop
    execute format('create policy "mfa_required" on public.%I as restrictive for all to authenticated using ((select public.mfa_satisfied()))', t);
  end loop;
end $$;
