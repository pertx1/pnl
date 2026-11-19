-- =============================================================================
-- Kreo · Fase 2 · Módulo INVESTIGACIÓN: competencia (5.8), productos ganadores (5.9), inspiración y hooks (5.10).
-- Solo datos PÚBLICOS obtenidos por APIs oficiales (YouTube Data API, Instagram Business Discovery, Meta Ad Library,
-- oEmbed oficiales). Nada de scraping. Ver docs/compliance/research.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Competencia: perfiles públicos seguidos por proyecto + snapshot de sus publicaciones.
-- YouTube = "Non-Authorized Data": se refresca o se borra en ≤ 30 días (tarea diaria de Inngest).
-- -----------------------------------------------------------------------------
create table public.research_competitors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),
  external_id text not null check (char_length(external_id) <= 200),
  handle text check (char_length(handle) <= 200),
  display_name text check (char_length(display_name) <= 300),
  avatar_url text check (char_length(avatar_url) <= 2000),
  profile_url text check (char_length(profile_url) <= 2000),
  followers bigint,
  total_views bigint,
  media_count bigint,
  -- Instagram: cuenta conectada del proyecto cuyo token se usa para Business Discovery.
  via_social_account_id uuid references public.social_accounts (id) on delete set null,
  last_fetched_at timestamptz,
  fetch_error text check (char_length(fetch_error) <= 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, platform, external_id)
);
create index research_competitors_workspace_idx on public.research_competitors (workspace_id);
create index research_competitors_project_idx on public.research_competitors (project_id, created_at desc);
create index research_competitors_via_idx on public.research_competitors (via_social_account_id);
create index research_competitors_created_by_idx on public.research_competitors (created_by);
create index research_competitors_fetched_idx on public.research_competitors (platform, last_fetched_at);
create trigger research_competitors_updated_at before update on public.research_competitors
  for each row execute function public.set_updated_at();
create trigger research_competitors_ws before insert or update of workspace_id, project_id on public.research_competitors
  for each row execute function public.enforce_project_workspace();

create table public.research_competitor_posts (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.research_competitors (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  external_id text not null check (char_length(external_id) <= 200),
  title text check (char_length(title) <= 1000),
  url text check (char_length(url) <= 2000),
  thumbnail_url text check (char_length(thumbnail_url) <= 2000),
  media_type text check (char_length(media_type) <= 40),
  published_at timestamptz,
  views bigint,
  likes bigint,
  comments bigint,
  fetched_at timestamptz not null default now(),
  unique (competitor_id, external_id)
);
create index research_competitor_posts_workspace_idx on public.research_competitor_posts (workspace_id);
create index research_competitor_posts_published_idx on public.research_competitor_posts (competitor_id, published_at desc);
create index research_competitor_posts_fetched_idx on public.research_competitor_posts (fetched_at);

-- Alertas de outliers nuevos (tarea cada 6 h).
create table public.research_alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  competitor_id uuid not null references public.research_competitors (id) on delete cascade,
  post_id uuid not null unique references public.research_competitor_posts (id) on delete cascade,
  multiple numeric(8, 2) not null check (multiple >= 0),
  seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index research_alerts_workspace_idx on public.research_alerts (workspace_id);
create index research_alerts_project_idx on public.research_alerts (project_id, created_at desc);
create index research_alerts_competitor_idx on public.research_alerts (competitor_id);
create trigger research_alerts_ws before insert or update of workspace_id, project_id on public.research_alerts
  for each row execute function public.enforce_project_workspace();

-- -----------------------------------------------------------------------------
-- Productos ganadores: listas + productos guardados (con datos públicos de la Ad Library y calculadora de margen).
-- -----------------------------------------------------------------------------
create table public.research_product_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);
create index research_product_lists_workspace_idx on public.research_product_lists (workspace_id);
create index research_product_lists_created_by_idx on public.research_product_lists (created_by);
create trigger research_product_lists_ws before insert or update of workspace_id, project_id on public.research_product_lists
  for each row execute function public.enforce_project_workspace();

create table public.research_products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  list_id uuid references public.research_product_lists (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 5000),
  supplier_url text check (char_length(supplier_url) <= 2000),
  source text not null default 'manual' check (source in ('manual', 'meta_ad_library')),
  ad_archive_id text check (char_length(ad_archive_id) <= 64),
  page_name text check (char_length(page_name) <= 300),
  ad_snapshot_url text check (char_length(ad_snapshot_url) <= 2000),
  ad_text text check (char_length(ad_text) <= 4000),
  platforms text[] not null default '{}',
  countries text[] not null default '{}',
  ad_started_at timestamptz,
  score int check (score between 0 and 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  -- Calculadora de margen (importes en la moneda del producto).
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  sale_price numeric(12, 2) check (sale_price >= 0),
  unit_cost numeric(12, 2) check (unit_cost >= 0),
  shipping_cost numeric(12, 2) check (shipping_cost >= 0),
  fee_pct numeric(5, 2) check (fee_pct between 0 and 100),
  cpa numeric(12, 2) check (cpa >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index research_products_workspace_idx on public.research_products (workspace_id);
create index research_products_project_idx on public.research_products (project_id, created_at desc);
create index research_products_list_idx on public.research_products (list_id);
create index research_products_created_by_idx on public.research_products (created_by);
create trigger research_products_updated_at before update on public.research_products
  for each row execute function public.set_updated_at();
create trigger research_products_ws before insert or update of workspace_id, project_id on public.research_products
  for each row execute function public.enforce_project_workspace();

-- -----------------------------------------------------------------------------
-- Inspiración: swipe file (solo enlace + metadatos públicos de oEmbed + notas) y biblioteca de hooks.
-- -----------------------------------------------------------------------------
create table public.research_swipes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  url text not null check (char_length(url) <= 2000 and url ~* '^https://'),
  network text not null check (network in ('youtube', 'tiktok', 'instagram', 'facebook', 'other')),
  kind text not null check (kind in ('video', 'ad', 'post')),
  title text check (char_length(title) <= 500),
  author_name text check (char_length(author_name) <= 300),
  thumbnail_url text check (char_length(thumbnail_url) <= 2000),
  oembed_fetched_at timestamptz,
  notes text not null default '' check (char_length(notes) <= 5000),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index research_swipes_workspace_idx on public.research_swipes (workspace_id);
create index research_swipes_project_idx on public.research_swipes (project_id, created_at desc);
create index research_swipes_created_by_idx on public.research_swipes (created_by);
create index research_swipes_tags_idx on public.research_swipes using gin (tags);
create trigger research_swipes_updated_at before update on public.research_swipes
  for each row execute function public.set_updated_at();
create trigger research_swipes_ws before insert or update of workspace_id, project_id on public.research_swipes
  for each row execute function public.enforce_project_workspace();

create table public.research_hooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  niche text not null default '' check (char_length(niche) <= 80),
  format text not null default '' check (char_length(format) <= 40),
  source text not null default 'user' check (source in ('user', 'ai')),
  generation_id uuid references public.ai_generations (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index research_hooks_workspace_idx on public.research_hooks (workspace_id);
create index research_hooks_project_idx on public.research_hooks (project_id, created_at desc);
create index research_hooks_generation_idx on public.research_hooks (generation_id);
create index research_hooks_created_by_idx on public.research_hooks (created_by);
create trigger research_hooks_ws before insert or update of workspace_id, project_id on public.research_hooks
  for each row execute function public.enforce_project_workspace();

-- -----------------------------------------------------------------------------
-- Análisis de IA guardados (Analista de competencia y Cazador de productos).
-- -----------------------------------------------------------------------------
create table public.research_analyses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  subject_type text not null check (subject_type in ('competitor', 'product')),
  subject_id uuid not null,
  agent_version text not null check (char_length(agent_version) <= 60),
  result jsonb not null,
  generation_id uuid references public.ai_generations (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index research_analyses_workspace_idx on public.research_analyses (workspace_id);
create index research_analyses_subject_idx on public.research_analyses (subject_type, subject_id, created_at desc);
create index research_analyses_project_idx on public.research_analyses (project_id);
create index research_analyses_generation_idx on public.research_analyses (generation_id);
create index research_analyses_created_by_idx on public.research_analyses (created_by);
create trigger research_analyses_ws before insert or update of workspace_id, project_id on public.research_analyses
  for each row execute function public.enforce_project_workspace();

-- -----------------------------------------------------------------------------
-- Coherencia de workspace en filas hijas (publicaciones de un competidor, producto ↔ lista).
-- -----------------------------------------------------------------------------
create or replace function public.research_child_workspace_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'research_competitor_posts' then
    if not exists (select 1 from public.research_competitors c where c.id = new.competitor_id and c.workspace_id = new.workspace_id) then
      raise exception 'workspace_mismatch' using errcode = '42501';
    end if;
  elsif tg_table_name = 'research_alerts' then
    if not exists (
      select 1 from public.research_competitor_posts p
      join public.research_competitors c on c.id = p.competitor_id
      where p.id = new.post_id and c.id = new.competitor_id and c.project_id = new.project_id
    ) then
      raise exception 'workspace_mismatch' using errcode = '42501';
    end if;
  elsif tg_table_name = 'research_products' then
    if new.list_id is not null and not exists (
      select 1 from public.research_product_lists l where l.id = new.list_id and l.project_id = new.project_id
    ) then
      raise exception 'workspace_mismatch' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.research_child_workspace_guard() from public, anon, authenticated;

create trigger research_competitor_posts_ws before insert or update of workspace_id, competitor_id on public.research_competitor_posts
  for each row execute function public.research_child_workspace_guard();
create trigger research_alerts_child_ws before insert or update of post_id, competitor_id, project_id on public.research_alerts
  for each row execute function public.research_child_workspace_guard();
create trigger research_products_list_ws before insert or update of list_id, project_id on public.research_products
  for each row execute function public.research_child_workspace_guard();

-- =============================================================================
-- RLS: viewer lee; editor crea/edita/borra. + 2FA restrictivo.
-- =============================================================================
alter table public.research_competitors enable row level security;
alter table public.research_competitor_posts enable row level security;
alter table public.research_alerts enable row level security;
alter table public.research_product_lists enable row level security;
alter table public.research_products enable row level security;
alter table public.research_swipes enable row level security;
alter table public.research_hooks enable row level security;
alter table public.research_analyses enable row level security;

do $$
declare t text;
begin
  foreach t in array array['research_competitors','research_competitor_posts','research_alerts','research_product_lists',
                           'research_products','research_swipes','research_hooks']
  loop
    execute format('create policy "%s_select" on public.%I for select to authenticated using (public.has_workspace_role(workspace_id, ''viewer''))', t, t);
    execute format('create policy "%s_insert_editor" on public.%I for insert to authenticated with check (public.has_workspace_role(workspace_id, ''editor''))', t, t);
    execute format('create policy "%s_update_editor" on public.%I for update to authenticated using (public.has_workspace_role(workspace_id, ''editor'')) with check (public.has_workspace_role(workspace_id, ''editor''))', t, t);
    execute format('create policy "%s_delete_editor" on public.%I for delete to authenticated using (public.has_workspace_role(workspace_id, ''editor''))', t, t);
  end loop;
end $$;

-- Análisis de IA: inmutables (lectura viewer, alta editor, borrado editor).
create policy "research_analyses_select" on public.research_analyses for select to authenticated
  using (public.has_workspace_role(workspace_id, 'viewer'));
create policy "research_analyses_insert_editor" on public.research_analyses for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'editor') and created_by = (select auth.uid()));
create policy "research_analyses_delete_editor" on public.research_analyses for delete to authenticated
  using (public.has_workspace_role(workspace_id, 'editor'));

do $$
declare t text;
begin
  foreach t in array array['research_competitors','research_competitor_posts','research_alerts','research_product_lists',
                           'research_products','research_swipes','research_hooks','research_analyses']
  loop
    execute format('create policy "mfa_required" on public.%I as restrictive for all to authenticated using ((select public.mfa_satisfied()))', t);
  end loop;
end $$;
