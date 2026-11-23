-- =============================================================================
-- Kreo · Control de gasto de créditos desde asistentes de IA (MCP).
-- Cada app conectada (OAuth) y cada API key tiene:
--   - allow_credit_spend: interruptor «permitir gastar créditos», APAGADO por defecto.
--   - daily_credit_cap: tope de créditos por día UTC (por defecto 50).
-- El consumo se reserva de forma atómica ANTES de cobrar (mcp_credit_reserve) y se libera si no llega a cobrarse.
-- Los reembolsos por fallo del proveedor no devuelven cupo (criterio conservador).
-- =============================================================================

alter table public.mcp_oauth_grants
  add column allow_credit_spend boolean not null default false,
  add column daily_credit_cap int not null default 50 check (daily_credit_cap between 0 and 100000);
alter table public.mcp_api_keys
  add column allow_credit_spend boolean not null default false,
  add column daily_credit_cap int not null default 50 check (daily_credit_cap between 0 and 100000);

create table public.mcp_credit_usage (
  source_kind text not null check (source_kind in ('oauth', 'api_key')),
  source_id uuid not null,
  day date not null,
  credits int not null default 0 check (credits >= 0),
  primary key (source_kind, source_id, day)
);
alter table public.mcp_credit_usage enable row level security;
create policy "mfa_required" on public.mcp_credit_usage as restrictive for all to authenticated using ((select public.mfa_satisfied()));

-- Reserva p_amount créditos del cupo de hoy. Devuelve 'ok', 'disabled' o 'cap_reached'. Solo service_role.
create or replace function public.mcp_credit_reserve(p_kind text, p_id uuid, p_amount int)
returns text language plpgsql security definer set search_path = '' as $$
declare v_allow boolean; v_cap int; v_day date := (now() at time zone 'utc')::date; v_ok int;
begin
  if p_amount < 0 then raise exception 'invalid_amount'; end if;
  if p_kind = 'oauth' then
    select allow_credit_spend, daily_credit_cap into v_allow, v_cap from public.mcp_oauth_grants where id = p_id and revoked_at is null;
  elsif p_kind = 'api_key' then
    select allow_credit_spend, daily_credit_cap into v_allow, v_cap from public.mcp_api_keys where id = p_id and revoked_at is null;
  else
    raise exception 'invalid_kind';
  end if;
  if not coalesce(v_allow, false) then return 'disabled'; end if;
  if p_amount > v_cap then return 'cap_reached'; end if;
  insert into public.mcp_credit_usage (source_kind, source_id, day, credits) values (p_kind, p_id, v_day, 0)
  on conflict do nothing;
  update public.mcp_credit_usage set credits = credits + p_amount
  where source_kind = p_kind and source_id = p_id and day = v_day and credits + p_amount <= v_cap
  returning 1 into v_ok;
  delete from public.mcp_credit_usage where source_kind = p_kind and source_id = p_id and day < v_day - 7;
  return case when v_ok is null then 'cap_reached' else 'ok' end;
end;
$$;

-- Libera una reserva que no llegó a cobrarse (reintento idempotente o error antes del cobro). Solo service_role.
create or replace function public.mcp_credit_release(p_kind text, p_id uuid, p_amount int)
returns void language sql security definer set search_path = '' as $$
  update public.mcp_credit_usage set credits = greatest(0, credits - greatest(p_amount, 0))
  where source_kind = p_kind and source_id = p_id and day = (now() at time zone 'utc')::date;
$$;

-- El propio usuario cambia el interruptor y el tope de SU app conectada o API key (con 2FA si la tiene).
create or replace function public.set_mcp_credit_policy(p_kind text, p_id uuid, p_allow boolean, p_cap int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.mfa_satisfied() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_cap is null or p_cap < 0 or p_cap > 100000 then raise exception 'invalid_cap' using errcode = '22023'; end if;
  if p_kind = 'oauth' then
    update public.mcp_oauth_grants set allow_credit_spend = p_allow, daily_credit_cap = p_cap
    where id = p_id and user_id = (select auth.uid()) and revoked_at is null;
  elsif p_kind = 'api_key' then
    update public.mcp_api_keys set allow_credit_spend = p_allow, daily_credit_cap = p_cap
    where id = p_id and user_id = (select auth.uid()) and revoked_at is null;
  else
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end;
$$;

-- Lo gastado hoy por las apps/keys del propio usuario (para mostrarlo en Ajustes).
create or replace function public.my_mcp_credit_usage_today()
returns table (source_kind text, source_id uuid, credits int)
language sql stable security definer set search_path = '' as $$
  select u.source_kind, u.source_id, u.credits from public.mcp_credit_usage u
  where u.day = (now() at time zone 'utc')::date and (
    (u.source_kind = 'oauth' and exists (select 1 from public.mcp_oauth_grants g where g.id = u.source_id and g.user_id = (select auth.uid())))
    or (u.source_kind = 'api_key' and exists (select 1 from public.mcp_api_keys k where k.id = u.source_id and k.user_id = (select auth.uid()))));
$$;

revoke execute on function public.mcp_credit_reserve(text, uuid, int) from public, anon, authenticated;
revoke execute on function public.mcp_credit_release(text, uuid, int) from public, anon, authenticated;
revoke execute on function public.set_mcp_credit_policy(text, uuid, boolean, int) from public, anon;
revoke execute on function public.my_mcp_credit_usage_today() from public, anon;
grant execute on function public.mcp_credit_reserve(text, uuid, int) to service_role;
grant execute on function public.mcp_credit_release(text, uuid, int) to service_role;
grant execute on function public.set_mcp_credit_policy(text, uuid, boolean, int) to authenticated;
grant execute on function public.my_mcp_credit_usage_today() to authenticated;
