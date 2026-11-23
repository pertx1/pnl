-- =============================================================================
-- TikTok sin auditoría de Direct Post: «Enviar a mis borradores de TikTok» y «Listo para subir a mano».
--
-- Nuevo estado 'awaiting_user_publish': Kreo ya entregó el destino de TikTok y falta que el CREADOR lo termine en la
-- app de TikTok, ya sea porque:
--   · el vídeo está en su bandeja/borradores de TikTok (Content Posting API · inbox/video/init, scope video.upload), o
--   · no se pudo usar ninguna API y Kreo lo dejó listo para subir a mano (descargar vídeo + copiar texto).
-- El modo va en post_targets.error_code con el prefijo 'info:' ('info:tiktok_inbox' / 'info:tiktok_manual:<motivo>')
-- y, en borradores, el publish_id de TikTok en external_post_id. No es un fallo.
-- Pasa a 'published' cuando TikTok confirma la publicación (status/fetch = PUBLISH_COMPLETE) o cuando la persona
-- pulsa «Ya lo he publicado» en Kreo. Mientras tanto el post queda bloqueado (como 'scheduled_on_platform').
--
-- Nota: `alter type ... add value` no puede usarse como literal del enum en la MISMA transacción. Por eso abajo
-- solo aparece dentro de funciones plpgsql (no se evalúa al crearlas) o comparando como texto (`status::text`).
-- IMPORTANTE: aplicar ANTES de desplegar el código (las consultas `.in("status", [...])` ya incluyen el valor nuevo).
-- =============================================================================

alter type public.post_status add value if not exists 'awaiting_user_publish' after 'scheduled_on_platform';

-- Aviso nuevo del centro de avisos: «Termina tu publicación en TikTok».
-- Mantener sincronizado con NOTIFICATION_TYPES en src/lib/notifications/types.ts.
create or replace function public.notification_types()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'post_published', 'post_failed', 'approval_pending', 'account_issue',
    'youtube_consent_expiring', 'ai_done', 'ai_failed', 'weekly_summary',
    'post_action_needed'
  ]::text[];
$$;
revoke execute on function public.notification_types() from public, anon;
grant execute on function public.notification_types() to authenticated, service_role;

-- Límite diario anti-baneo: lo entregado a TikTok para terminar a mano también ocupa su día.
create or replace function public.post_limit_violations(p_post_id uuid)
returns table (social_account_id uuid, handle text, day date, planned bigint, daily_limit int)
language sql stable security definer set search_path = '' as $$
  with me as (select scheduled_at, workspace_id from public.posts where id = p_post_id)
  select a.id, a.handle, (me.scheduled_at at time zone 'UTC')::date,
         (select count(*) from public.post_targets t2 join public.posts p2 on p2.id = t2.post_id
           where t2.social_account_id = a.id and p2.id <> p_post_id
             and p2.status::text in ('approved', 'scheduled', 'scheduled_on_platform', 'awaiting_user_publish', 'publishing', 'published')
             and (p2.scheduled_at at time zone 'UTC')::date = (me.scheduled_at at time zone 'UTC')::date) + 1,
         a.daily_post_limit
  from me
  join public.post_targets t on t.post_id = p_post_id
  join public.social_accounts a on a.id = t.social_account_id
  where public.has_workspace_role(me.workspace_id, 'viewer')
    and me.scheduled_at is not null
    and (select count(*) from public.post_targets t2 join public.posts p2 on p2.id = t2.post_id
          where t2.social_account_id = a.id and p2.id <> p_post_id
            and p2.status::text in ('approved', 'scheduled', 'scheduled_on_platform', 'awaiting_user_publish', 'publishing', 'published')
            and (p2.scheduled_at at time zone 'UTC')::date = (me.scheduled_at at time zone 'UTC')::date) + 1 > a.daily_post_limit;
$$;
revoke execute on function public.post_limit_violations(uuid) from public, anon;
grant execute on function public.post_limit_violations(uuid) to authenticated;

-- Un post entregado a TikTok queda bloqueado: el vídeo ya está en TikTok y editarlo en Kreo no cambiaría nada allí.
create or replace function public.guard_post_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_setting('kreo.allow_status', true) = 'on' then
    return new;
  end if;
  if new.status is distinct from old.status and new.status not in ('draft', 'pending_approval', 'cancelled') then
    raise exception 'status_change_forbidden' using errcode = '42501';
  end if;
  if old.status::text in ('publishing', 'published', 'scheduled_on_platform', 'awaiting_user_publish') then
    raise exception 'post_locked' using errcode = '42501';
  end if;
  if old.status in ('approved', 'scheduled') and new.status = old.status
     and (new.caption is distinct from old.caption or new.asset_ids is distinct from old.asset_ids
          or new.scheduled_at is distinct from old.scheduled_at or new.ai_generated is distinct from old.ai_generated
          or new.title is distinct from old.title) then
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
revoke execute on function public.guard_post_status() from public, anon, authenticated;

create or replace function public.guard_target_status()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_post_status public.post_status;
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
  if new.caption_override is distinct from old.caption_override
     or new.platform_options is distinct from old.platform_options
     or new.social_account_id is distinct from old.social_account_id then
    select status into v_post_status from public.posts where id = new.post_id;
    if v_post_status::text in ('publishing', 'published', 'scheduled_on_platform', 'awaiting_user_publish')
       or old.status::text in ('publishing', 'published', 'scheduled_on_platform', 'awaiting_user_publish') then
      raise exception 'post_locked' using errcode = '42501';
    end if;
    if v_post_status in ('approved', 'scheduled') then
      perform set_config('kreo.allow_status', 'on', true);
      update public.posts set status = 'pending_approval', approved_by = null, approved_at = null where id = new.post_id;
      update public.post_targets set status = 'pending_approval' where post_id = new.post_id and id <> new.id;
      perform set_config('kreo.allow_status', 'off', true);
      new.status := 'pending_approval';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_target_status() from public, anon, authenticated;

-- Volver a borrador / cancelar: un destino ya entregado a TikTok no se toca (el vídeo ya está allí). Igual que
-- los publicados y los programados en YouTube. (Un post entero en 'awaiting_user_publish' no se puede desprogramar.)
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
    error_code = null where post_id = p_post_id and status::text not in ('published', 'scheduled_on_platform', 'awaiting_user_publish');
  perform set_config('kreo.allow_status', 'off', true);
  perform public.log_activity(v_ws, case when p_cancel then 'post.cancelled' else 'post.unscheduled' end, 'post', p_post_id::text);
end;
$$;
revoke execute on function public.unschedule_post(uuid, boolean) from public, anon;
grant execute on function public.unschedule_post(uuid, boolean) to authenticated;
