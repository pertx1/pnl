-- =============================================================================
-- Kreo · Centro de avisos dentro de la app (+ preferencias por tipo) y subtítulos .srt en project-media.
--
-- - notifications: un aviso por usuario. Cada usuario ve y borra SOLO los suyos (y solo mientras sea miembro del
--   workspace). Nadie los crea desde el navegador: los crea el servidor (notify_user, service_role) o triggers de
--   esta migración. Marcar como leído: RPC mark_notifications_read (no hay política de UPDATE).
-- - notification_preferences: tipos desactivados por usuario (todo activado por defecto).
-- - Privacidad: los avisos guardan textos cortos y IDs (nunca tokens, ni mensajes ni datos de terceros).
--   Limpieza: los leídos de más de 90 días se borran en la tarea `data-retention` (Inngest).
-- - Email: aún NO (no hay dominio propio). Punto de extensión: src/lib/notifications/notify.ts (`deliverExternal`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos de aviso (mantener sincronizado con src/lib/notifications/types.ts)
-- -----------------------------------------------------------------------------
create or replace function public.notification_types()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'post_published', 'post_failed', 'approval_pending', 'account_issue',
    'youtube_consent_expiring', 'ai_done', 'ai_failed', 'weekly_summary'
  ]::text[];
$$;

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  type text not null check (type = any (public.notification_types())),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 1000),
  -- Solo enlaces internos de la app (sin open redirect).
  link text check (link is null or (link ~ '^/app(/[A-Za-z0-9/_?=&.-]*)?$' and char_length(link) <= 300)),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 16384),
  dedupe_key text check (char_length(dedupe_key) <= 200),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)   -- NULL no choca: sin clave no hay deduplicación
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_workspace_idx on public.notifications (workspace_id);
create index notifications_project_idx on public.notifications (project_id);
create index notifications_read_at_idx on public.notifications (read_at) where read_at is not null;

create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  disabled_types text[] not null default '{}' check (disabled_types <@ public.notification_types()),
  updated_at timestamptz not null default now()
);
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

create policy "notifications_select_own" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and public.has_workspace_role(workspace_id, 'viewer'));
create policy "notifications_delete_own" on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()) and public.has_workspace_role(workspace_id, 'viewer'));

create policy "notification_preferences_select_own" on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notification_preferences_insert_own" on public.notification_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "notification_preferences_update_own" on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "mfa_required" on public.notifications as restrictive for all to authenticated using ((select public.mfa_satisfied()));
create policy "mfa_required" on public.notification_preferences as restrictive for all to authenticated using ((select public.mfa_satisfied()));

-- -----------------------------------------------------------------------------
-- Funciones
-- -----------------------------------------------------------------------------

-- Marca como leídos los avisos propios (todos o los indicados). Devuelve cuántos.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  if (select auth.uid()) is null or not public.mfa_satisfied() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Idioma del usuario para los textos generados en SQL.
create or replace function public.notification_locale(p_user_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select locale from public.profiles where id = p_user_id), 'es');
$$;

-- Crea un aviso si el usuario es miembro del workspace y no ha desactivado ese tipo.
-- Idempotente con p_dedupe_key. Devuelve el id o null. SOLO servidor (service_role) y triggers internos.
create or replace function public.notify_user(
  p_user_id uuid,
  p_workspace_id uuid,
  p_project_id uuid,
  p_type text,
  p_title text,
  p_body text default '',
  p_link text default null,
  p_data jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_user_id is null or p_workspace_id is null then return null; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = p_user_id) then
    return null;
  end if;
  if p_project_id is not null
     and not exists (select 1 from public.projects p where p.id = p_project_id and p.workspace_id = p_workspace_id) then
    return null;
  end if;
  if exists (select 1 from public.notification_preferences np where np.user_id = p_user_id and p_type = any (np.disabled_types)) then
    return null;
  end if;
  insert into public.notifications (id, user_id, workspace_id, project_id, type, title, body, link, data, dedupe_key)
  values (
    coalesce(p_id, gen_random_uuid()), p_user_id, p_workspace_id, p_project_id, p_type,
    left(coalesce(nullif(btrim(p_title), ''), p_type), 200), left(coalesce(p_body, ''), 1000), p_link,
    coalesce(p_data, '{}'::jsonb), p_dedupe_key
  )
  on conflict (user_id, dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Aviso a admins y owners de una publicación enviada a aprobación (cualquier camino: app, MCP…).
-- Nunca rompe el envío: cualquier error se registra como WARNING y se sigue.
create or replace function public.notify_post_pending_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record; v_en boolean; v_title text;
begin
  begin
    v_title := left(coalesce(nullif(btrim(new.title), ''), ''), 80);
    for r in
      select m.user_id from public.workspace_members m
      where m.workspace_id = new.workspace_id and m.role in ('admin', 'owner')
        and m.user_id is distinct from (select auth.uid())
    loop
      v_en := public.notification_locale(r.user_id) = 'en';
      perform public.notify_user(
        r.user_id, new.workspace_id, new.project_id, 'approval_pending',
        case when v_en then 'Post waiting for approval' else 'Publicación pendiente de aprobar' end,
        case when v_title <> '' then v_title
             when v_en then 'Review it and approve it so it can be scheduled.'
             else 'Revísala y apruébala para que se pueda programar.' end,
        '/app/p/' || new.project_id || '/posts/' || new.id,
        jsonb_build_object('post_id', new.id),
        'approval:' || new.id || ':' || extract(epoch from now())::bigint
      );
    end loop;
  exception when others then
    raise warning 'notify_post_pending_approval: %', sqlstate;
  end;
  return new;
end;
$$;
create trigger posts_notify_pending_insert after insert on public.posts
  for each row when (new.status = 'pending_approval') execute function public.notify_post_pending_approval();
create trigger posts_notify_pending_update after update of status on public.posts
  for each row when (old.status is distinct from new.status and new.status = 'pending_approval')
  execute function public.notify_post_pending_approval();

-- Clipper: trabajo analizado (o fallido) y short renderizado (o fallido) → aviso a quien lo lanzó.
create or replace function public.notify_clip_job()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_en boolean; v_ok boolean := new.status = 'ready';
begin
  begin
    if new.created_by is null then return new; end if;
    v_en := public.notification_locale(new.created_by) = 'en';
    perform public.notify_user(
      new.created_by, new.workspace_id, new.project_id, case when v_ok then 'ai_done' else 'ai_failed' end,
      case when v_ok and v_en then 'Clipper: highlights ready'
           when v_ok then 'Clipper: momentos listos'
           when v_en then 'Clipper: the video could not be processed'
           else 'Clipper: no se pudo procesar el vídeo' end,
      case when v_ok then left(coalesce(new.title, ''), 120)
           when v_en then 'The credits have been refunded.'
           else 'Se han devuelto los créditos.' end,
      '/app/p/' || new.project_id || '/clipper?job=' || new.id,
      jsonb_build_object('kind', 'clipper', 'job_id', new.id),
      'clip_job:' || new.id || ':' || new.status
    );
  exception when others then
    raise warning 'notify_clip_job: %', sqlstate;
  end;
  return new;
end;
$$;
create trigger clip_jobs_notify after update of status on public.clip_jobs
  for each row when (old.status is distinct from new.status and new.status in ('ready', 'failed'))
  execute function public.notify_clip_job();

create or replace function public.notify_clip_segment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_en boolean; v_ok boolean := new.status = 'done';
begin
  begin
    select g.created_by into v_user from public.ai_generations g where g.id = new.generation_id;
    if v_user is null then select j.created_by into v_user from public.clip_jobs j where j.id = new.job_id; end if;
    if v_user is null then return new; end if;
    v_en := public.notification_locale(v_user) = 'en';
    perform public.notify_user(
      v_user, new.workspace_id, new.project_id, case when v_ok then 'ai_done' else 'ai_failed' end,
      case when v_ok and v_en then 'Clipper: short ready'
           when v_ok then 'Clipper: short listo'
           when v_en then 'Clipper: the short could not be rendered'
           else 'Clipper: no se pudo crear el short' end,
      case when v_ok then left(coalesce(new.title, ''), 120)
           when v_en then 'The credits have been refunded.'
           else 'Se han devuelto los créditos.' end,
      '/app/p/' || new.project_id || '/clipper?job=' || new.job_id,
      jsonb_build_object('kind', 'clipper_short', 'job_id', new.job_id, 'segment_id', new.id),
      'clip_segment:' || new.id || ':' || new.status || ':' || extract(epoch from now())::bigint
    );
  exception when others then
    raise warning 'notify_clip_segment: %', sqlstate;
  end;
  return new;
end;
$$;
create trigger clip_segments_notify after update of status on public.clip_segments
  for each row when (old.status is distinct from new.status and new.status in ('done', 'failed'))
  execute function public.notify_clip_segment();

-- Al salir de un workspace (o ser expulsado) se borran sus avisos de ese workspace (minimización).
create or replace function public.purge_member_notifications()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.notifications where user_id = old.user_id and workspace_id = old.workspace_id;
  return old;
end;
$$;
create trigger workspace_members_purge_notifications after delete on public.workspace_members
  for each row execute function public.purge_member_notifications();

-- -----------------------------------------------------------------------------
-- Permisos de ejecución
-- -----------------------------------------------------------------------------
revoke execute on function public.notification_types() from public, anon;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
revoke execute on function public.notification_locale(uuid) from public, anon, authenticated;
revoke execute on function public.notify_user(uuid, uuid, uuid, text, text, text, text, jsonb, text, uuid) from public, anon, authenticated;
revoke execute on function public.notify_post_pending_approval() from public, anon, authenticated;
revoke execute on function public.notify_clip_job() from public, anon, authenticated;
revoke execute on function public.notify_clip_segment() from public, anon, authenticated;
revoke execute on function public.purge_member_notifications() from public, anon, authenticated;
grant execute on function public.notification_types() to authenticated, service_role;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.notify_user(uuid, uuid, uuid, text, text, text, text, jsonb, text, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Subtítulos: permitir archivos .srt (texto) en project-media para subirlos a YouTube con captions.insert.
-- Convención (ver src/lib/social/captions.ts): mismo storage_path que el vídeo con extensión .srt.
-- -----------------------------------------------------------------------------
update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'application/x-subrip')
where id = 'project-media'
  and allowed_mime_types is not null
  and not ('application/x-subrip' = any (allowed_mime_types));
