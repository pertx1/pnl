-- =============================================================================
-- Kreo · Mi agenda: bloques de tiempo personales del USUARIO (no de un proyecto) y su jornada.
--
-- - agenda_blocks: bloques puntuales o recurrentes (días de la semana ISO 1 = lunes … 7 = domingo, con fecha de fin opcional).
--   Las horas se guardan como minutos LOCALES (0–1440) + zona horaria IANA: «L-V 9:00-17:00» sigue siendo 9:00-17:00
--   después del cambio de hora. end_day = último día en que puede ocurrir (en los puntuales, igual a start_day;
--   null = recurrente sin fin), así la consulta por rango es un simple start_day <= hasta y (end_day is null o >= desde).
--   skipped_days: días concretos borrados de una serie («borrar solo este día»).
--   Un bloque de «creación» puede vincularse a un proyecto, tarea del roadmap o publicación: solo si el usuario puede verlos
--   (la comprobación usa las políticas RLS de esas tablas).
-- - agenda_settings: inicio y fin de la jornada (por defecto 08:00–23:00) y zona horaria (Europe/Madrid).
--
-- Privacidad: cada usuario solo ve y modifica lo suyo (ni siquiera los owners del workspace). 2FA exigido (mfa_required).
-- Borrado de cuenta: cascada desde auth.users. Exportación: src/app/app/settings/export/route.ts.
-- =============================================================================

create type public.agenda_block_kind as enum ('work', 'study', 'sport', 'personal', 'creation', 'other');

create table public.agenda_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  kind public.agenda_block_kind not null default 'other',
  note text not null default '' check (char_length(note) <= 1000),
  start_day date not null,
  end_day date,
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 1 and 1440),
  repeat_days smallint[] not null default '{}' check (repeat_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  skipped_days date[] not null default '{}' check (cardinality(skipped_days) <= 400),
  timezone text not null default 'Europe/Madrid' check (char_length(timezone) between 1 and 64),
  project_id uuid references public.projects (id) on delete set null,
  task_id uuid references public.roadmap_tasks (id) on delete set null,
  post_id uuid references public.posts (id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'plan', 'mcp')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_blocks_time_order check (end_minute > start_minute),
  constraint agenda_blocks_day_order check (end_day is null or end_day >= start_day),
  constraint agenda_blocks_one_off check (cardinality(repeat_days) > 0 or end_day = start_day)
);
create index agenda_blocks_user_range_idx on public.agenda_blocks (user_id, start_day, end_day);
create index agenda_blocks_project_idx on public.agenda_blocks (project_id);
create index agenda_blocks_task_idx on public.agenda_blocks (task_id);
create index agenda_blocks_post_idx on public.agenda_blocks (post_id);

create trigger agenda_blocks_updated_at before update on public.agenda_blocks
  for each row execute function public.set_updated_at();

create table public.agenda_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  day_start_minute smallint not null default 480 check (day_start_minute between 0 and 1439),
  day_end_minute smallint not null default 1380 check (day_end_minute between 1 and 1440),
  timezone text not null default 'Europe/Madrid' check (char_length(timezone) between 1 and 64),
  updated_at timestamptz not null default now(),
  constraint agenda_settings_order check (day_end_minute > day_start_minute)
);

create trigger agenda_settings_updated_at before update on public.agenda_settings
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Row Level Security: solo el propio usuario. Los vínculos (proyecto, tarea, publicación) solo se aceptan si el usuario
-- puede ver ese elemento (las subconsultas se evalúan con su RLS).
-- =============================================================================
alter table public.agenda_blocks enable row level security;
alter table public.agenda_settings enable row level security;

create policy "agenda_blocks_select_own" on public.agenda_blocks for select to authenticated
  using (user_id = (select auth.uid()));
create policy "agenda_blocks_insert_own" on public.agenda_blocks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id))
    and (task_id is null or exists (select 1 from public.roadmap_tasks t where t.id = task_id))
    and (post_id is null or exists (select 1 from public.posts x where x.id = post_id))
  );
create policy "agenda_blocks_update_own" on public.agenda_blocks for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id))
    and (task_id is null or exists (select 1 from public.roadmap_tasks t where t.id = task_id))
    and (post_id is null or exists (select 1 from public.posts x where x.id = post_id))
  );
create policy "agenda_blocks_delete_own" on public.agenda_blocks for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "agenda_settings_select_own" on public.agenda_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy "agenda_settings_insert_own" on public.agenda_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "agenda_settings_update_own" on public.agenda_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "agenda_settings_delete_own" on public.agenda_settings for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "mfa_required" on public.agenda_blocks as restrictive for all to authenticated
  using ((select public.mfa_satisfied()));
create policy "mfa_required" on public.agenda_settings as restrictive for all to authenticated
  using ((select public.mfa_satisfied()));

-- Nadie anónimo.
revoke all on table public.agenda_blocks from anon;
revoke all on table public.agenda_settings from anon;
