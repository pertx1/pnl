-- =============================================================================
-- Kreo · Servidor de autorización OAuth 2.1 para el servidor MCP (conectores personalizados de Claude y otros clientes MCP).
--
-- Especificación MCP 2026-07-28 (Authorization): OAuth 2.1 + PKCE S256, Protected Resource Metadata (RFC 9728),
-- Authorization Server Metadata (RFC 8414), Client ID Metadata Documents y Dynamic Client Registration (RFC 7591),
-- Resource Indicators (RFC 8707), revocación (RFC 7009).
--
-- - mcp_oauth_clients: clientes registrados (DCR) o documentos CIMD cacheados. Solo service_role.
-- - mcp_oauth_codes: códigos de autorización de un solo uso (5 min), guardados como hash SHA-256. Solo service_role.
-- - mcp_oauth_grants: "apps conectadas" (usuario + workspace + cliente + scopes + recurso). El usuario ve y revoca las suyas.
-- - mcp_oauth_tokens: tokens de acceso (1 h) y de refresco rotatorios (30 días), SOLO hash SHA-256. Solo service_role.
-- - mcp_oauth_rate_limits: límites por sujeto (usuario o hash truncado de IP). Solo service_role.
-- Ningún token ni código se guarda en claro.
-- =============================================================================

create table public.mcp_oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique check (char_length(client_id) between 8 and 300),
  kind text not null check (kind in ('dcr', 'cimd')),
  client_name text not null default '' check (char_length(client_name) <= 100),
  client_uri text check (char_length(client_uri) <= 300),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  metadata_fetched_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index mcp_oauth_clients_cleanup_idx on public.mcp_oauth_clients (kind, created_at) where last_used_at is null;

create table public.mcp_oauth_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  client_id text not null references public.mcp_oauth_clients (client_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  redirect_uri text not null check (char_length(redirect_uri) <= 2000),
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  scope text not null check (char_length(scope) <= 200),
  resource text not null check (char_length(resource) <= 300),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index mcp_oauth_codes_client_idx on public.mcp_oauth_codes (client_id);
create index mcp_oauth_codes_user_idx on public.mcp_oauth_codes (user_id);
create index mcp_oauth_codes_workspace_idx on public.mcp_oauth_codes (workspace_id);
create index mcp_oauth_codes_expires_idx on public.mcp_oauth_codes (expires_at);

create table public.mcp_oauth_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id text not null references public.mcp_oauth_clients (client_id) on delete cascade,
  client_name text not null default '' check (char_length(client_name) <= 100),   -- copia para mostrarla (autodeclarado por el cliente)
  client_host text not null default '' check (char_length(client_host) <= 255),    -- host del redirect_uri (verificable)
  scope text not null check (char_length(scope) <= 200),
  resource text not null check (char_length(resource) <= 300),
  code_id uuid unique references public.mcp_oauth_codes (id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index mcp_oauth_grants_user_idx on public.mcp_oauth_grants (user_id, created_at desc);
create index mcp_oauth_grants_workspace_idx on public.mcp_oauth_grants (workspace_id);
create index mcp_oauth_grants_client_idx on public.mcp_oauth_grants (client_id);

create table public.mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.mcp_oauth_grants (id) on delete cascade,
  kind text not null check (kind in ('access', 'refresh')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,      -- refresh ya rotado
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index mcp_oauth_tokens_grant_idx on public.mcp_oauth_tokens (grant_id, kind);
create index mcp_oauth_tokens_expires_idx on public.mcp_oauth_tokens (expires_at);

create table public.mcp_oauth_rate_limits (
  subject text not null check (char_length(subject) between 1 and 100),
  bucket text not null check (bucket in ('minute', 'day')),
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (subject, bucket, window_start)
);

-- =============================================================================
-- Funciones
-- =============================================================================

-- Consentimiento: el usuario (con sesión y 2FA si la tiene) crea un código para un workspace del que es miembro.
create or replace function public.mcp_oauth_create_code(
  p_code_hash text,
  p_client_id text,
  p_workspace_id uuid,
  p_redirect_uri text,
  p_code_challenge text,
  p_scope text,
  p_resource text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.mfa_satisfied() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.has_workspace_role(p_workspace_id, 'viewer') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.mcp_oauth_clients where client_id = p_client_id) then
    raise exception 'invalid_client' using errcode = 'P0001';
  end if;
  insert into public.mcp_oauth_codes (code_hash, client_id, user_id, workspace_id, redirect_uri, code_challenge, scope, resource, expires_at)
  values (p_code_hash, p_client_id, (select auth.uid()), p_workspace_id, p_redirect_uri, p_code_challenge, p_scope, p_resource, now() + interval '5 minutes');
  -- Limpieza perezosa de códigos caducados.
  delete from public.mcp_oauth_codes where id in (
    select id from public.mcp_oauth_codes where expires_at < now() - interval '1 day' limit 200
  );
end;
$$;

-- Revoca una autorización y todos sus tokens (uso interno).
create or replace function public.mcp_oauth_revoke_grant_internal(p_grant_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.mcp_oauth_grants set revoked_at = coalesce(revoked_at, now()) where id = p_grant_id;
  update public.mcp_oauth_tokens set revoked_at = coalesce(revoked_at, now()) where grant_id = p_grant_id;
$$;

-- Emite tokens nuevos para una autorización (uso interno).
create or replace function public.mcp_oauth_issue_tokens_internal(p_grant_id uuid, p_access_hash text, p_refresh_hash text, p_access_ttl int, p_refresh_ttl int)
returns void language sql security definer set search_path = '' as $$
  insert into public.mcp_oauth_tokens (grant_id, kind, token_hash, expires_at) values
    (p_grant_id, 'access', p_access_hash, now() + make_interval(secs => p_access_ttl)),
    (p_grant_id, 'refresh', p_refresh_hash, now() + make_interval(secs => p_refresh_ttl));
$$;

-- Intercambio código → tokens (PKCE ya calculado por el servidor: p_code_challenge = BASE64URL(SHA256(code_verifier))).
-- Devuelve un estado en vez de lanzar errores para que la revocación por reutilización del código quede guardada.
create or replace function public.mcp_oauth_exchange_code(
  p_code_hash text,
  p_client_id text,
  p_redirect_uri text,
  p_code_challenge text,
  p_resource text,
  p_access_hash text,
  p_refresh_hash text,
  p_access_ttl int,
  p_refresh_ttl int
)
returns table (status text, grant_id uuid, scope text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  c public.mcp_oauth_codes%rowtype;
  v_grant uuid;
  v_name text;
begin
  select * into c from public.mcp_oauth_codes where code_hash = p_code_hash for update;
  if not found then
    return query select 'invalid_grant'::text, null::uuid, null::text; return;
  end if;
  if c.used_at is not null then
    -- Código reutilizado: posible robo. Se revoca lo emitido con él (OAuth 2.1 §4.1.3).
    perform public.mcp_oauth_revoke_grant_internal(g.id) from public.mcp_oauth_grants g where g.code_id = c.id;
    return query select 'invalid_grant'::text, null::uuid, null::text; return;
  end if;
  update public.mcp_oauth_codes set used_at = now() where id = c.id;   -- un solo intento, aunque falle
  if c.expires_at < now() or c.client_id <> p_client_id or c.redirect_uri <> p_redirect_uri or c.code_challenge <> p_code_challenge then
    return query select 'invalid_grant'::text, null::uuid, null::text; return;
  end if;
  if p_resource is not null and p_resource <> c.resource then
    return query select 'invalid_target'::text, null::uuid, null::text; return;
  end if;
  if public.member_role(c.user_id, c.workspace_id) is null then
    return query select 'invalid_grant'::text, null::uuid, null::text; return;
  end if;

  select client_name into v_name from public.mcp_oauth_clients where client_id = c.client_id;
  insert into public.mcp_oauth_grants (user_id, workspace_id, client_id, client_name, client_host, scope, resource, code_id)
  values (c.user_id, c.workspace_id, c.client_id, coalesce(v_name, ''),
          coalesce(substring(c.redirect_uri from '^[a-zA-Z][a-zA-Z0-9+.-]*://([^/:?#]+)'), ''), c.scope, c.resource, c.id)
  returning id into v_grant;
  perform public.mcp_oauth_issue_tokens_internal(v_grant, p_access_hash, p_refresh_hash, p_access_ttl, p_refresh_ttl);
  update public.mcp_oauth_clients set last_used_at = now() where client_id = c.client_id;

  -- Máximo 25 apps conectadas activas por usuario: se revocan las más antiguas.
  perform public.mcp_oauth_revoke_grant_internal(o.id)
  from (select g.id from public.mcp_oauth_grants g where g.user_id = c.user_id and g.revoked_at is null
        order by g.created_at desc offset 25) o;

  return query select 'ok'::text, v_grant, c.scope;
end;
$$;

-- Refresco con rotación. Reutilizar un refresh token ya rotado revoca toda la autorización
-- (salvo en los 10 s siguientes a la rotación: peticiones concurrentes del mismo cliente).
create or replace function public.mcp_oauth_refresh(
  p_refresh_hash text,
  p_client_id text,
  p_resource text,
  p_access_hash text,
  p_refresh_hash_new text,
  p_access_ttl int,
  p_refresh_ttl int
)
returns table (status text, grant_id uuid, scope text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  t public.mcp_oauth_tokens%rowtype;
  g public.mcp_oauth_grants%rowtype;
begin
  select * into t from public.mcp_oauth_tokens where token_hash = p_refresh_hash and kind = 'refresh' for update;
  if not found then
    return query select 'invalid_grant'::text, null::uuid, null::text; return;
  end if;
  select * into g from public.mcp_oauth_grants where id = t.grant_id for update;
  if g.revoked_at is not null or t.revoked_at is not null then
    return query select 'invalid_grant'::text, null::uuid, null::text; return;
  end if;
  if t.used_at is not null then
    if t.used_at < now() - interval '10 seconds' then
      perform public.mcp_oauth_revoke_grant_internal(g.id);
    end if;
    return query select 'invalid_grant'::text, null::uuid, null::text; return;
  end if;
  if t.expires_at < now() or g.client_id <> p_client_id then
    return query select 'invalid_grant'::text, null::uuid, null::text; return;
  end if;
  if p_resource is not null and p_resource <> g.resource then
    return query select 'invalid_target'::text, null::uuid, null::text; return;
  end if;
  if public.member_role(g.user_id, g.workspace_id) is null then
    perform public.mcp_oauth_revoke_grant_internal(g.id);
    return query select 'invalid_grant'::text, null::uuid, null::text; return;
  end if;

  update public.mcp_oauth_tokens set used_at = now() where id = t.id;
  perform public.mcp_oauth_issue_tokens_internal(g.id, p_access_hash, p_refresh_hash_new, p_access_ttl, p_refresh_ttl);
  -- Limpieza de tokens caducados de esta autorización.
  delete from public.mcp_oauth_tokens where mcp_oauth_tokens.grant_id = g.id and expires_at < now() - interval '1 day';
  return query select 'ok'::text, g.id, g.scope;
end;
$$;

-- Validación de un token de acceso en cada petición al MCP. Comprueba caducidad, revocación y que el usuario siga en el workspace.
create or replace function public.mcp_oauth_verify_access(p_hash text)
returns table (grant_id uuid, user_id uuid, workspace_id uuid, client_id text, scope text, resource text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  g public.mcp_oauth_grants%rowtype;
begin
  select gr.* into g
  from public.mcp_oauth_tokens t
  join public.mcp_oauth_grants gr on gr.id = t.grant_id
  where t.token_hash = p_hash and t.kind = 'access' and t.revoked_at is null and t.expires_at > now() and gr.revoked_at is null;
  if not found or public.member_role(g.user_id, g.workspace_id) is null then
    return;
  end if;
  if g.last_used_at is null or g.last_used_at < now() - interval '1 minute' then
    update public.mcp_oauth_grants set last_used_at = now() where id = g.id;
  end if;
  return query select g.id, g.user_id, g.workspace_id, g.client_id, g.scope, g.resource;
end;
$$;

-- Revocación RFC 7009 (desde el cliente): revoca la autorización completa del token si pertenece a ese cliente.
create or replace function public.mcp_oauth_revoke_token(p_hash text, p_client_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_grant uuid;
begin
  select g.id into v_grant from public.mcp_oauth_tokens t join public.mcp_oauth_grants g on g.id = t.grant_id
  where t.token_hash = p_hash and (p_client_id is null or g.client_id = p_client_id);
  if v_grant is not null then
    perform public.mcp_oauth_revoke_grant_internal(v_grant);
  end if;
end;
$$;

-- Revocación desde Ajustes › Apps conectadas (el propio usuario, con 2FA si la tiene).
create or replace function public.revoke_mcp_oauth_grant(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.mfa_satisfied() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.mcp_oauth_grants where id = p_id and user_id = (select auth.uid())) then
    perform public.mcp_oauth_revoke_grant_internal(p_id);
  end if;
end;
$$;

-- Límite de peticiones por sujeto (ventanas fijas de 1 minuto y 1 día). Devuelve true si está permitida.
create or replace function public.mcp_oauth_rate_limit_hit(p_subject text, p_per_minute int, p_per_day int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_min int; v_day int;
begin
  insert into public.mcp_oauth_rate_limits (subject, bucket, window_start, hits)
  values (p_subject, 'minute', date_trunc('minute', now()), 1)
  on conflict (subject, bucket, window_start) do update set hits = public.mcp_oauth_rate_limits.hits + 1
  returning hits into v_min;
  insert into public.mcp_oauth_rate_limits (subject, bucket, window_start, hits)
  values (p_subject, 'day', date_trunc('day', now()), 1)
  on conflict (subject, bucket, window_start) do update set hits = public.mcp_oauth_rate_limits.hits + 1
  returning hits into v_day;
  delete from public.mcp_oauth_rate_limits
  where subject = p_subject and ((bucket = 'minute' and window_start < now() - interval '10 minutes')
                              or (bucket = 'day' and window_start < now() - interval '2 days'));
  return v_min <= p_per_minute and v_day <= p_per_day;
end;
$$;

revoke execute on function public.mcp_oauth_create_code(text, text, uuid, text, text, text, text) from public, anon;
revoke execute on function public.mcp_oauth_revoke_grant_internal(uuid) from public, anon, authenticated;
revoke execute on function public.mcp_oauth_issue_tokens_internal(uuid, text, text, int, int) from public, anon, authenticated;
revoke execute on function public.mcp_oauth_exchange_code(text, text, text, text, text, text, text, int, int) from public, anon, authenticated;
revoke execute on function public.mcp_oauth_refresh(text, text, text, text, text, int, int) from public, anon, authenticated;
revoke execute on function public.mcp_oauth_verify_access(text) from public, anon, authenticated;
revoke execute on function public.mcp_oauth_revoke_token(text, text) from public, anon, authenticated;
revoke execute on function public.revoke_mcp_oauth_grant(uuid) from public, anon;
revoke execute on function public.mcp_oauth_rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.mcp_oauth_create_code(text, text, uuid, text, text, text, text) to authenticated;
grant execute on function public.revoke_mcp_oauth_grant(uuid) to authenticated;
grant execute on function public.mcp_oauth_exchange_code(text, text, text, text, text, text, text, int, int) to service_role;
grant execute on function public.mcp_oauth_refresh(text, text, text, text, text, int, int) to service_role;
grant execute on function public.mcp_oauth_verify_access(text) to service_role;
grant execute on function public.mcp_oauth_revoke_token(text, text) to service_role;
grant execute on function public.mcp_oauth_rate_limit_hit(text, int, int) to service_role;

-- =============================================================================
-- Row Level Security: todo solo service_role, salvo que cada usuario ve sus "apps conectadas".
-- =============================================================================
alter table public.mcp_oauth_clients enable row level security;
alter table public.mcp_oauth_codes enable row level security;
alter table public.mcp_oauth_grants enable row level security;
alter table public.mcp_oauth_tokens enable row level security;
alter table public.mcp_oauth_rate_limits enable row level security;

create policy "mcp_oauth_grants_select_own" on public.mcp_oauth_grants for select to authenticated
  using (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['mcp_oauth_clients','mcp_oauth_codes','mcp_oauth_grants','mcp_oauth_tokens','mcp_oauth_rate_limits']
  loop
    execute format('create policy "mfa_required" on public.%I as restrictive for all to authenticated using ((select public.mfa_satisfied()))', t);
  end loop;
end $$;
