-- =============================================================================
-- Kreo · Fase 1 · Borrado de cuenta (RGPD) y lista de espera con doble opt-in + referidos
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Workspaces que el usuario actual no puede abandonar sin transferir (es owner y hay más miembros)
-- -----------------------------------------------------------------------------
create or replace function public.my_blocking_workspaces()
returns table (workspace_id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.name
  from public.workspaces w
  join public.workspace_members m on m.workspace_id = w.id and m.user_id = (select auth.uid()) and m.role = 'owner'
  where exists (
    select 1 from public.workspace_members o where o.workspace_id = w.id and o.user_id <> (select auth.uid())
  )
  and not exists (
    select 1 from public.workspace_members o2
    where o2.workspace_id = w.id and o2.user_id <> (select auth.uid()) and o2.role = 'owner'
  );
$$;

-- Workspaces que se borrarán con la cuenta (el usuario es el único miembro).
create or replace function public.my_solo_workspaces()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_members m
  where m.user_id = (select auth.uid())
    and not exists (
      select 1 from public.workspace_members o where o.workspace_id = m.workspace_id and o.user_id <> (select auth.uid())
    );
$$;

-- Borra la cuenta del usuario actual y, en cascada, sus workspaces en solitario.
-- Los archivos de Storage y los tokens OAuth se eliminan/revocan ANTES desde el servidor.
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
  if exists (select 1 from public.my_blocking_workspaces()) then
    raise exception 'transfer_ownership_required' using errcode = 'P0001';
  end if;

  delete from public.workspaces where id in (select public.my_solo_workspaces());
  delete from auth.users where id = v_user;   -- cascada: profiles, workspace_members, sesiones, factores MFA
end;
$$;

revoke execute on function public.my_blocking_workspaces() from public, anon;
revoke execute on function public.my_solo_workspaces() from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.my_blocking_workspaces() to authenticated;
grant execute on function public.my_solo_workspaces() to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- -----------------------------------------------------------------------------
-- Lista de espera
-- Tokens guardados como hash SHA-256 (nunca en claro). Solo el servidor (service_role) opera.
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null unique check (char_length(email) <= 254),
  locale text not null default 'es' check (locale in ('es', 'en')),
  referral_code text not null unique,
  referred_by uuid references public.waitlist (id) on delete set null,
  confirm_token_hash text,
  unsubscribe_token_hash text not null,
  consent_at timestamptz not null default now(),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index waitlist_referred_by_idx on public.waitlist (referred_by);

alter table public.waitlist enable row level security;
-- Sin políticas: ni anon ni authenticated pueden leer/escribir. Solo service_role (que salta RLS).

create or replace function public.waitlist_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- Alta (o reenvío si ya existe sin confirmar). Devuelve los tokens EN CLARO para enviarlos por email.
-- Si el email ya está confirmado no devuelve token (no se reenvía nada ni se revela nada al visitante).
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

-- Confirmar (doble opt-in). Devuelve el código de referido o null si el token no es válido.
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
      and created_at > now() - interval '7 days'
    returning referral_code into v_code;
  return v_code;
end;
$$;

-- Baja en un clic: borra el registro (minimización). Devuelve true si existía.
create or replace function public.waitlist_unsubscribe(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.waitlist where unsubscribe_token_hash = public.waitlist_hash(p_token);
  return found;
end;
$$;

-- Posición: confirmados ordenados por nº de referidos confirmados (desc) y fecha de confirmación (asc).
create or replace function public.waitlist_status(p_code text)
returns table (rank_position bigint, total bigint, referrals bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select w.referral_code,
           (select count(*) from public.waitlist r where r.referred_by = w.id and r.confirmed_at is not null) as refs,
           w.confirmed_at
    from public.waitlist w
    where w.confirmed_at is not null
  ), ordered as (
    select referral_code, refs, row_number() over (order by refs desc, confirmed_at asc) as pos, count(*) over () as total
    from ranked
  )
  select pos, total, refs from ordered where referral_code = upper(btrim(p_code));
$$;

revoke execute on function public.waitlist_hash(text) from public, anon, authenticated;
revoke execute on function public.waitlist_join(text, text, text) from public, anon, authenticated;
revoke execute on function public.waitlist_confirm(text) from public, anon, authenticated;
revoke execute on function public.waitlist_unsubscribe(text) from public, anon, authenticated;
revoke execute on function public.waitlist_status(text) from public, anon, authenticated;
grant execute on function public.waitlist_join(text, text, text) to service_role;
grant execute on function public.waitlist_confirm(text) to service_role;
grant execute on function public.waitlist_unsubscribe(text) to service_role;
grant execute on function public.waitlist_status(text) to service_role;
grant execute on function public.waitlist_hash(text) to service_role;
