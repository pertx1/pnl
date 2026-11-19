-- =============================================================================
-- Kreo · Fase 2 · Estrategia y roadmap (5.12) + Calentamiento guiado de cuentas (5.6)
--
-- - strategies: estrategia por proyecto (o por cuenta social): pilares, público, frecuencia, objetivos/KPIs.
-- - roadmap_milestones / roadmap_tasks: hitos con fecha y tareas (estado, responsable, fecha, post vinculado).
-- - warmup_plans / warmup_tasks: plan de calentamiento de 7–14 días con checklist de acciones MANUALES.
--   Kreo nunca ejecuta ninguna de esas acciones en las plataformas: solo es una lista guiada.
-- Lectura: viewer. Escritura: editor. 2FA exigido (política restrictiva mfa_required).
-- =============================================================================

create type public.roadmap_task_status as enum ('todo', 'doing', 'done');
create type public.warmup_plan_status as enum ('active', 'completed', 'archived');

-- -----------------------------------------------------------------------------
-- Estrategias
-- -----------------------------------------------------------------------------
create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  social_account_id uuid references public.social_accounts (id) on delete cascade,  -- null = todo el proyecto
  title text not null default '' check (char_length(title) <= 120),
  summary text not null default '' check (char_length(summary) <= 2000),
  audience text not null default '' check (char_length(audience) <= 2000),
  -- [{ id, name, description, examples[], share }]
  pillars jsonb not null default '[]'::jsonb check (jsonb_typeof(pillars) = 'array' and jsonb_array_length(pillars) <= 12),
  -- [{ platform, postsPerWeek, hour }]
  frequency jsonb not null default '[]'::jsonb check (jsonb_typeof(frequency) = 'array' and jsonb_array_length(frequency) <= 6),
  -- [{ id, objective, kpi, target, deadline }]
  objectives jsonb not null default '[]'::jsonb check (jsonb_typeof(objectives) = 'array' and jsonb_array_length(objectives) <= 20),
  source text not null default 'manual' check (source in ('manual', 'template', 'ai')),
  prompt_version text check (char_length(prompt_version) <= 60),
  ai_generation_id uuid references public.ai_generations (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint strategies_scope_unique unique nulls not distinct (project_id, social_account_id)
);
create index strategies_workspace_idx on public.strategies (workspace_id);
create index strategies_account_idx on public.strategies (social_account_id);
create index strategies_generation_idx on public.strategies (ai_generation_id);
create index strategies_created_by_idx on public.strategies (created_by);
create trigger strategies_updated_at before update on public.strategies
  for each row execute function public.set_updated_at();
create trigger strategies_ws before insert or update of workspace_id, project_id on public.strategies
  for each row execute function public.enforce_project_workspace();

create table public.roadmap_milestones (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  strategy_id uuid not null references public.strategies (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 1000),
  due_date date,
  position int not null default 0 check (position between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index roadmap_milestones_strategy_idx on public.roadmap_milestones (strategy_id, position);
create index roadmap_milestones_workspace_idx on public.roadmap_milestones (workspace_id);
create index roadmap_milestones_project_idx on public.roadmap_milestones (project_id);
create trigger roadmap_milestones_updated_at before update on public.roadmap_milestones
  for each row execute function public.set_updated_at();
create trigger roadmap_milestones_ws before insert or update of workspace_id, project_id on public.roadmap_milestones
  for each row execute function public.enforce_project_workspace();

create table public.roadmap_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  strategy_id uuid not null references public.strategies (id) on delete cascade,
  milestone_id uuid not null references public.roadmap_milestones (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  brief text not null default '' check (char_length(brief) <= 2000),
  platform public.social_platform,
  status public.roadmap_task_status not null default 'todo',
  assignee_id uuid references auth.users (id) on delete set null,
  due_date date,
  position int not null default 0 check (position between 0 and 1000),
  post_id uuid references public.posts (id) on delete set null,   -- borrador creado con "Pasar al calendario"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index roadmap_tasks_milestone_idx on public.roadmap_tasks (milestone_id, position);
create index roadmap_tasks_strategy_idx on public.roadmap_tasks (strategy_id);
create index roadmap_tasks_workspace_idx on public.roadmap_tasks (workspace_id);
create index roadmap_tasks_project_idx on public.roadmap_tasks (project_id);
create index roadmap_tasks_assignee_idx on public.roadmap_tasks (assignee_id);
create index roadmap_tasks_post_idx on public.roadmap_tasks (post_id);
create trigger roadmap_tasks_updated_at before update on public.roadmap_tasks
  for each row execute function public.set_updated_at();
create trigger roadmap_tasks_ws before insert or update of workspace_id, project_id on public.roadmap_tasks
  for each row execute function public.enforce_project_workspace();

-- -----------------------------------------------------------------------------
-- Calentamiento guiado
-- -----------------------------------------------------------------------------
create table public.warmup_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  social_account_id uuid references public.social_accounts (id) on delete set null,  -- null = cuenta planificada (aún no conectada)
  platform public.social_platform not null,
  handle text check (char_length(handle) <= 60),
  niche text not null default '' check (char_length(niche) <= 200),
  locale text not null default 'es' check (locale in ('es', 'en')),
  start_date date not null,
  duration_days int not null check (duration_days between 7 and 14),
  status public.warmup_plan_status not null default 'active',
  issues text[] not null default '{}' check (cardinality(issues) <= 10),
  source text not null default 'template' check (source in ('template', 'ai')),
  prompt_version text check (char_length(prompt_version) <= 60),
  ai_generation_id uuid references public.ai_generations (id) on delete set null,
  -- Recordatorio por email (opcional, lo activa cada usuario para sí mismo).
  reminder_user_id uuid references auth.users (id) on delete set null,
  -- Lo actualiza la tarea diaria de Inngest para mostrar el aviso dentro de la app.
  needs_attention boolean not null default false,
  pending_count int not null default 0 check (pending_count >= 0),
  last_checked_at timestamptz,
  last_reminded_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index warmup_plans_project_idx on public.warmup_plans (project_id, created_at);
create index warmup_plans_workspace_idx on public.warmup_plans (workspace_id);
create index warmup_plans_account_idx on public.warmup_plans (social_account_id);
create index warmup_plans_generation_idx on public.warmup_plans (ai_generation_id);
create index warmup_plans_reminder_user_idx on public.warmup_plans (reminder_user_id);
create index warmup_plans_created_by_idx on public.warmup_plans (created_by);
create index warmup_plans_status_idx on public.warmup_plans (status);
create trigger warmup_plans_updated_at before update on public.warmup_plans
  for each row execute function public.set_updated_at();
create trigger warmup_plans_ws before insert or update of workspace_id, project_id on public.warmup_plans
  for each row execute function public.enforce_project_workspace();

create table public.warmup_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  plan_id uuid not null references public.warmup_plans (id) on delete cascade,
  day int not null check (day between 1 and 14),
  position int not null default 0 check (position between 0 and 100),
  category text not null check (category in ('profile', 'content', 'engage', 'safety', 'learn')),
  title text not null check (char_length(title) between 1 and 200),
  detail text not null default '' check (char_length(detail) <= 1000),
  target_count int check (target_count between 0 and 100),
  source text not null default 'template' check (source in ('template', 'ai', 'adjust')),
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index warmup_tasks_plan_idx on public.warmup_tasks (plan_id, day, position);
create index warmup_tasks_workspace_idx on public.warmup_tasks (workspace_id);
create index warmup_tasks_done_by_idx on public.warmup_tasks (done_by);

-- -----------------------------------------------------------------------------
-- Coherencia entre filas (mismo proyecto / workspace; responsable = miembro; recordatorio solo para uno mismo)
-- -----------------------------------------------------------------------------
create or replace function public.strategy_rows_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'strategies' then
    if new.social_account_id is not null and not exists (
      select 1 from public.social_accounts a where a.id = new.social_account_id and a.project_id = new.project_id
    ) then
      raise exception 'workspace_mismatch' using errcode = '42501';
    end if;
  elsif tg_table_name = 'roadmap_milestones' then
    if not exists (select 1 from public.strategies s where s.id = new.strategy_id and s.project_id = new.project_id) then
      raise exception 'workspace_mismatch' using errcode = '42501';
    end if;
  elsif tg_table_name = 'roadmap_tasks' then
    if not exists (
      select 1 from public.roadmap_milestones m
      where m.id = new.milestone_id and m.strategy_id = new.strategy_id and m.project_id = new.project_id
    ) then
      raise exception 'workspace_mismatch' using errcode = '42501';
    end if;
    if new.assignee_id is not null and not exists (
      select 1 from public.workspace_members wm where wm.workspace_id = new.workspace_id and wm.user_id = new.assignee_id
    ) then
      raise exception 'assignee_not_member' using errcode = '42501';
    end if;
    if new.post_id is not null and not exists (
      select 1 from public.posts p where p.id = new.post_id and p.project_id = new.project_id
    ) then
      raise exception 'workspace_mismatch' using errcode = '42501';
    end if;
  elsif tg_table_name = 'warmup_plans' then
    if new.social_account_id is not null and not exists (
      select 1 from public.social_accounts a
      where a.id = new.social_account_id and a.project_id = new.project_id and a.platform = new.platform
    ) then
      raise exception 'workspace_mismatch' using errcode = '42501';
    end if;
    -- Nadie puede apuntar a otra persona a los emails de recordatorio (solo a sí mismo; el servidor puede quitarlo).
    if new.reminder_user_id is not null
       and new.reminder_user_id is distinct from (case when tg_op = 'UPDATE' then old.reminder_user_id end)
       and new.reminder_user_id is distinct from (select auth.uid())
       and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif tg_table_name = 'warmup_tasks' then
    if not exists (select 1 from public.warmup_plans p where p.id = new.plan_id and p.workspace_id = new.workspace_id) then
      raise exception 'workspace_mismatch' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger strategies_guard before insert or update of project_id, social_account_id on public.strategies
  for each row execute function public.strategy_rows_guard();
create trigger roadmap_milestones_guard before insert or update of project_id, strategy_id on public.roadmap_milestones
  for each row execute function public.strategy_rows_guard();
create trigger roadmap_tasks_guard before insert or update of project_id, strategy_id, milestone_id, assignee_id, post_id on public.roadmap_tasks
  for each row execute function public.strategy_rows_guard();
create trigger warmup_plans_guard before insert or update of project_id, social_account_id, platform, reminder_user_id on public.warmup_plans
  for each row execute function public.strategy_rows_guard();
create trigger warmup_tasks_guard before insert or update of workspace_id, plan_id on public.warmup_tasks
  for each row execute function public.strategy_rows_guard();

revoke execute on function public.strategy_rows_guard() from public, anon, authenticated;

-- =============================================================================
-- RLS: viewer lee, editor edita. + 2FA.
-- =============================================================================
alter table public.strategies enable row level security;
alter table public.roadmap_milestones enable row level security;
alter table public.roadmap_tasks enable row level security;
alter table public.warmup_plans enable row level security;
alter table public.warmup_tasks enable row level security;

do $$
declare t text;
begin
  foreach t in array array['strategies', 'roadmap_milestones', 'roadmap_tasks', 'warmup_plans', 'warmup_tasks']
  loop
    execute format('create policy "%s_select" on public.%I for select to authenticated using ((select public.has_workspace_role(workspace_id, ''viewer'')))', t, t);
    execute format('create policy "%s_insert_editor" on public.%I for insert to authenticated with check ((select public.has_workspace_role(workspace_id, ''editor'')))', t, t);
    execute format('create policy "%s_update_editor" on public.%I for update to authenticated using ((select public.has_workspace_role(workspace_id, ''editor''))) with check ((select public.has_workspace_role(workspace_id, ''editor'')))', t, t);
    execute format('create policy "%s_delete_editor" on public.%I for delete to authenticated using ((select public.has_workspace_role(workspace_id, ''editor'')))', t, t);
    execute format('create policy "mfa_required" on public.%I as restrictive for all to authenticated using ((select public.mfa_satisfied()))', t);
  end loop;
end $$;
