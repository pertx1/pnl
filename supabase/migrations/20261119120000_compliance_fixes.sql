-- =============================================================================
-- Kreo · Correcciones de la revisión de seguridad-legal (2026-11-19). Ver docs/compliance.md.
-- 1) 2FA también en las funciones SECURITY DEFINER (antes solo en las políticas RLS).
-- 2) Cambiar el texto/opciones/cuenta de un destino ya aprobado obliga a volver a aprobar.
-- 3) La etiqueta IA de un post no se puede quitar si incluye un medio generado con IA.
-- 4) Lista de espera: el enlace reenviado caduca desde el último consentimiento; sin reenvíos en ráfaga.
-- =============================================================================

-- 1) has_workspace_role exige aal2 si el usuario tiene 2FA. Así lo cumplen también approve_post, submit_post,
--    upsert_social_account, start_ai_generation, las políticas de Storage, etc. (las restrictivas
--    "mfa_required" no aplican dentro de funciones SECURITY DEFINER).
create or replace function public.has_workspace_role(p_workspace_id uuid, p_min_role public.workspace_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.workspace_role_of(p_workspace_id) >= p_min_role, false) and public.mfa_satisfied();
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'mfa_required' using errcode = '42501';
  end if;
  if exists (select 1 from public.my_blocking_workspaces()) then
    raise exception 'transfer_ownership_required' using errcode = 'P0001';
  end if;

  delete from public.workspaces where id in (select public.my_solo_workspaces());
  delete from auth.users where id = v_user;
end;
$$;

-- 2) Destinos: cambiar texto, opciones o cuenta de un post aprobado/programado lo devuelve a pendiente de aprobación.
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
    if v_post_status in ('publishing', 'published') or old.status in ('publishing', 'published') then
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

-- 3a) Etiqueta IA obligatoria si algún medio del post es generado con IA (se ejecuta antes que posts_status_guard).
create or replace function public.enforce_post_ai_label()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.assets a where a.id = any (new.asset_ids) and a.ai_generated) then
    new.ai_generated := true;
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_post_ai_label() from public, anon, authenticated;
create trigger posts_ai_label before insert or update of asset_ids, ai_generated on public.posts
  for each row execute function public.enforce_post_ai_label();

-- 3b) Quitar/poner la etiqueta IA o cambiar el título de un post aprobado también exige volver a aprobar.
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

-- 4) Lista de espera.
create or replace function public.waitlist_confirm(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  update public.waitlist
    set confirmed_at = coalesce(confirmed_at, now()), confirm_token_hash = null
    where confirm_token_hash = public.waitlist_hash(p_token)
      and consent_at > now() - interval '7 days'
    returning referral_code into v_code;
  return v_code;
end;
$$;

-- Reenvío solo si han pasado ≥ 10 min desde el último (evita usar el formulario para bombardear un buzón).
create or replace function public.waitlist_join(p_email text, p_ref text, p_locale text)
returns table (confirm_token text, unsubscribe_token text, already_confirmed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.waitlist;
  v_confirm text := encode(extensions.gen_random_bytes(24), 'hex');
  v_unsub text := encode(extensions.gen_random_bytes(24), 'hex');
  v_ref uuid;
  v_code text;
begin
  select * into v_row from public.waitlist where email = lower(btrim(p_email));
  if found then
    if v_row.confirmed_at is not null then
      return query select null::text, null::text, true;
      return;
    end if;
    if v_row.consent_at > now() - interval '10 minutes' then
      return query select null::text, null::text, false;
      return;
    end if;
    update public.waitlist
      set confirm_token_hash = public.waitlist_hash(v_confirm),
          unsubscribe_token_hash = public.waitlist_hash(v_unsub),
          consent_at = now()
      where id = v_row.id;
    return query select v_confirm, v_unsub, false;
    return;
  end if;

  select id into v_ref from public.waitlist where referral_code = upper(btrim(coalesce(p_ref, ''))) and confirmed_at is not null;

  loop
    v_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
    exit when not exists (select 1 from public.waitlist where referral_code = v_code);
  end loop;

  insert into public.waitlist (email, locale, referral_code, referred_by, confirm_token_hash, unsubscribe_token_hash)
  values (
    lower(btrim(p_email)),
    case when p_locale = 'en' then 'en' else 'es' end,
    v_code,
    v_ref,
    public.waitlist_hash(v_confirm),
    public.waitlist_hash(v_unsub)
  );
  return query select v_confirm, v_unsub, false;
end;
$$;

revoke execute on function public.waitlist_confirm(text) from public, anon, authenticated;
revoke execute on function public.waitlist_join(text, text, text) from public, anon, authenticated;
grant execute on function public.waitlist_confirm(text) to service_role;
grant execute on function public.waitlist_join(text, text, text) to service_role;
