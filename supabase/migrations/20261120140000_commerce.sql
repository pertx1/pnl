-- =============================================================================
-- Kreo · Módulo COMMERCE: Shopify (5.13), informes PDF de marca blanca (5.14) y servidor MCP (5.18).
-- Ver docs/compliance/commerce.md.
--  - Shopify: OAuth oficial (authorization code grant + token offline caducable), tokens CIFRADOS en una tabla
--    sin políticas (solo service_role). Pedidos AGREGADOS sin datos personales de clientes.
--  - Informes: programaciones de envío por email a destinatarios del cliente + lista de bajas (solo hash).
--  - MCP: API keys personales (solo hash SHA-256), límite de peticiones en Postgres y cobro de créditos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shopify: tiendas vinculadas (una tienda → un proyecto de Kreo).
-- -----------------------------------------------------------------------------
create table public.shopify_stores (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  shop_domain text not null unique check (shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  shop_name text check (char_length(shop_name) <= 300),
  currency text check (currency ~ '^[A-Z]{3}$'),
  granted_scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'uninstalled', 'error')),
  connected_by uuid references auth.users (id) on delete set null,
  last_synced_at timestamptz,
  sync_error text check (char_length(sync_error) <= 120),
  uninstalled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index shopify_stores_project_idx on public.shopify_stores (project_id);
create index shopify_stores_workspace_idx on public.shopify_stores (workspace_id);
create index shopify_stores_connected_by_idx on public.shopify_stores (connected_by);
create trigger shopify_stores_updated_at before update on public.shopify_stores
  for each row execute function public.set_updated_at();
create trigger shopify_stores_ws before insert or update of workspace_id, project_id on public.shopify_stores
  for each row execute function public.enforce_project_workspace();

-- Tokens cifrados (AES-256-GCM). RLS activado SIN políticas → solo service_role.
create table public.shopify_store_tokens (
  store_id uuid primary key references public.shopify_stores (id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Pedidos agregados. SIN nombre, email, teléfono, dirección ni id de cliente.
create table public.shopify_orders (
  store_id uuid not null references public.shopify_stores (id) on delete cascade,
  shopify_order_id bigint not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  order_number text check (char_length(order_number) <= 40),
  ordered_at timestamptz not null,
  total numeric(14, 2) not null default 0,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  discount_codes text[] not null default '{}',
  landing_path text check (char_length(landing_path) <= 500),
  utm_source text check (char_length(utm_source) <= 200),
  utm_medium text check (char_length(utm_medium) <= 200),
  utm_campaign text check (char_length(utm_campaign) <= 200),
  utm_content text check (char_length(utm_content) <= 200),
  line_items jsonb not null default '[]'::jsonb,
  cancelled boolean not null default false,
  test boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (store_id, shopify_order_id)
);
create index shopify_orders_workspace_idx on public.shopify_orders (workspace_id);
create index shopify_orders_project_idx on public.shopify_orders (project_id, ordered_at desc);
create index shopify_orders_campaign_idx on public.shopify_orders (project_id, utm_campaign);
create index shopify_orders_codes_idx on public.shopify_orders using gin (discount_codes);
create trigger shopify_orders_ws before insert or update of workspace_id, project_id on public.shopify_orders
  for each row execute function public.enforce_project_workspace();

-- Atribución: enlaces UTM y códigos de descuento por publicación o creador.
create table public.commerce_attributions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('utm', 'discount')),
  post_id uuid references public.posts (id) on delete set null,
  creator_label text check (char_length(creator_label) <= 80),
  label text not null check (char_length(label) between 1 and 120),
  utm_source text check (char_length(utm_source) <= 100),
  utm_medium text check (char_length(utm_medium) <= 100),
  utm_campaign text check (char_length(utm_campaign) <= 100),
  url text check (char_length(url) <= 2000),
  discount_code text check (discount_code ~ '^[A-Z0-9_-]{3,40}$'),
  discount_percent numeric(5, 2) check (discount_percent > 0 and discount_percent <= 90),
  shopify_discount_id text check (char_length(shopify_discount_id) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (post_id is not null or creator_label is not null),
  check ((kind = 'utm' and url is not null) or (kind = 'discount' and discount_code is not null))
);
create index commerce_attributions_workspace_idx on public.commerce_attributions (workspace_id);
create index commerce_attributions_project_idx on public.commerce_attributions (project_id, created_at desc);
create index commerce_attributions_post_idx on public.commerce_attributions (post_id);
create index commerce_attributions_created_by_idx on public.commerce_attributions (created_by);
create unique index commerce_attributions_code_idx on public.commerce_attributions (project_id, discount_code) where discount_code is not null;
create trigger commerce_attributions_ws before insert or update of workspace_id, project_id on public.commerce_attributions
  for each row execute function public.enforce_project_workspace();

-- -----------------------------------------------------------------------------
-- Informes PDF: envíos programados y bajas.
-- -----------------------------------------------------------------------------
create table public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  frequency text not null check (frequency in ('weekly', 'monthly')),
  recipients text[] not null check (cardinality(recipients) between 1 and 10),
  sender_name text not null check (char_length(sender_name) between 1 and 80),
  locale text not null default 'es' check (locale in ('es', 'en')),
  include_sales boolean not null default true,
  show_footer boolean not null default true,
  active boolean not null default true,
  next_run_at timestamptz not null,
  last_sent_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index report_schedules_workspace_idx on public.report_schedules (workspace_id);
create index report_schedules_project_idx on public.report_schedules (project_id);
create index report_schedules_due_idx on public.report_schedules (next_run_at) where active;
create index report_schedules_created_by_idx on public.report_schedules (created_by);
create trigger report_schedules_updated_at before update on public.report_schedules
  for each row execute function public.set_updated_at();
create trigger report_schedules_ws before insert or update of workspace_id, project_id on public.report_schedules
  for each row execute function public.enforce_project_workspace();

-- Destinatarios que se dieron de baja (solo hash SHA-256 del email normalizado). Un editor no puede volver a añadirlos.
create table public.report_unsubscribes (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (workspace_id, email_hash)
);

-- Garantía en BD: emails válidos y nunca destinatarios que se dieron de baja (salvo el servidor).
create or replace function public.report_recipients_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r text;
begin
  foreach r in array new.recipients loop
    if r !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(r) > 254 then
      raise exception 'invalid_recipient' using errcode = '22023';
    end if;
    if coalesce(auth.role(), '') <> 'service_role' and exists (
      select 1 from public.report_unsubscribes u
      where u.workspace_id = new.workspace_id
        and u.email_hash = encode(extensions.digest(lower(btrim(r)), 'sha256'), 'hex')
    ) then
      raise exception 'recipient_unsubscribed' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function public.report_recipients_guard() from public, anon, authenticated;
create trigger report_schedules_recipients before insert or update of recipients on public.report_schedules
  for each row execute function public.report_recipients_guard();

-- -----------------------------------------------------------------------------
-- MCP: API keys personales + límite de peticiones.
-- -----------------------------------------------------------------------------
create table public.mcp_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  prefix text not null check (char_length(prefix) between 8 and 24),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index mcp_api_keys_user_idx on public.mcp_api_keys (user_id, created_at desc);

create table public.mcp_rate_limits (
  key_id uuid not null references public.mcp_api_keys (id) on delete cascade,
  bucket text not null check (bucket in ('minute', 'day')),
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key_id, bucket, window_start)
);

-- =============================================================================
-- Funciones
-- =============================================================================

-- Crear una API key (el servidor genera la clave y solo envía su hash). Máx. 10 activas por usuario.
create or replace function public.create_mcp_api_key(p_name text, p_prefix text, p_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null or not public.mfa_satisfied() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (select count(*) from public.mcp_api_keys where user_id = (select auth.uid()) and revoked_at is null) >= 10 then
    raise exception 'too_many_keys' using errcode = 'P0001';
  end if;
  insert into public.mcp_api_keys (user_id, name, prefix, key_hash)
  values ((select auth.uid()), p_name, p_prefix, p_hash)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.revoke_mcp_api_key(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.mfa_satisfied() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.mcp_api_keys set revoked_at = now()
  where id = p_id and user_id = (select auth.uid()) and revoked_at is null;
end;
$$;

-- Límite de peticiones por API key (ventanas fijas de 1 minuto y 1 día). Solo servidor.
-- Devuelve true si la petición está permitida.
create or replace function public.mcp_rate_limit_hit(p_key_id uuid, p_per_minute int, p_per_day int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_min int; v_day int;
begin
  insert into public.mcp_rate_limits (key_id, bucket, window_start, hits)
  values (p_key_id, 'minute', date_trunc('minute', now()), 1)
  on conflict (key_id, bucket, window_start) do update set hits = public.mcp_rate_limits.hits + 1
  returning hits into v_min;
  insert into public.mcp_rate_limits (key_id, bucket, window_start, hits)
  values (p_key_id, 'day', date_trunc('day', now()), 1)
  on conflict (key_id, bucket, window_start) do update set hits = public.mcp_rate_limits.hits + 1
  returning hits into v_day;
  -- Limpieza perezosa de ventanas antiguas de esta clave.
  delete from public.mcp_rate_limits
  where key_id = p_key_id and ((bucket = 'minute' and window_start < now() - interval '10 minutes')
                            or (bucket = 'day' and window_start < now() - interval '2 days'));
  return v_min <= p_per_minute and v_day <= p_per_day;
end;
$$;

-- Rol de un usuario concreto en un workspace (para el MCP, que no tiene sesión de Supabase). Solo servidor.
create or replace function public.member_role(p_user_id uuid, p_workspace_id uuid)
returns public.workspace_role language sql stable security definer set search_path = '' as $$
  select role from public.workspace_members where user_id = p_user_id and workspace_id = p_workspace_id;
$$;

-- Generación de IA iniciada desde el MCP: misma lógica que start_ai_generation (cobro atómico e idempotente),
-- pero con el usuario autenticado por API key. Solo servidor (service_role).
create or replace function public.mcp_start_ai_generation(
  p_user_id uuid,
  p_project_id uuid,
  p_kind text,
  p_provider text,
  p_model text,
  p_prompt text,
  p_params jsonb,
  p_credits int,
  p_license jsonb,
  p_idempotency_key text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid;
  v_id uuid;
  v_balance int;
  v_key text := 'ai:' || p_idempotency_key;
begin
  select workspace_id into v_ws from public.projects where id = p_project_id and archived_at is null;
  if v_ws is null or coalesce(public.member_role(p_user_id, v_ws) >= 'editor', false) is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select ref_id::uuid into v_id from public.credit_ledger where idempotency_key = v_key and workspace_id = v_ws;
  if found then
    return v_id;
  end if;

  v_id := gen_random_uuid();
  insert into public.ai_generations (id, workspace_id, project_id, kind, provider, model, prompt, params, credits_cost, status, license, created_by)
  values (v_id, v_ws, p_project_id, p_kind, p_provider, p_model, p_prompt, coalesce(p_params, '{}'::jsonb), p_credits, 'running',
          coalesce(p_license, '{}'::jsonb), p_user_id);

  if p_credits > 0 then
    select balance into v_balance from public.credit_balances where workspace_id = v_ws for update;
    if v_balance is null or v_balance < p_credits then
      raise exception 'insufficient_credits' using errcode = 'P0001';
    end if;
    v_balance := v_balance - p_credits;
    update public.credit_balances set balance = v_balance, updated_at = now() where workspace_id = v_ws;
    insert into public.credit_ledger (workspace_id, delta, balance_after, reason, ref_type, ref_id, idempotency_key, created_by)
    values (v_ws, -p_credits, v_balance, 'ai_' || p_kind, 'ai_generation', v_id::text, v_key, p_user_id);
  end if;
  return v_id;
end;
$$;

revoke execute on function public.create_mcp_api_key(text, text, text) from public, anon;
revoke execute on function public.revoke_mcp_api_key(uuid) from public, anon;
revoke execute on function public.mcp_rate_limit_hit(uuid, int, int) from public, anon, authenticated;
revoke execute on function public.member_role(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.mcp_start_ai_generation(uuid, uuid, text, text, text, text, jsonb, int, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_mcp_api_key(text, text, text) to authenticated;
grant execute on function public.revoke_mcp_api_key(uuid) to authenticated;
grant execute on function public.mcp_rate_limit_hit(uuid, int, int) to service_role;
grant execute on function public.member_role(uuid, uuid) to service_role;
grant execute on function public.mcp_start_ai_generation(uuid, uuid, text, text, text, text, jsonb, int, jsonb, text) to service_role;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.shopify_stores enable row level security;
alter table public.shopify_store_tokens enable row level security;   -- sin políticas: solo service_role
alter table public.shopify_orders enable row level security;
alter table public.commerce_attributions enable row level security;
alter table public.report_schedules enable row level security;
alter table public.report_unsubscribes enable row level security;
alter table public.mcp_api_keys enable row level security;
alter table public.mcp_rate_limits enable row level security;        -- sin políticas: solo service_role

-- Tienda: ver (viewer). Alta/actualización solo por el servidor tras OAuth; desvincular admin (vía servidor).
create policy "shopify_stores_select" on public.shopify_stores for select to authenticated
  using ((select public.has_workspace_role(workspace_id, 'viewer')));
-- Pedidos agregados: solo lectura (los escribe el servidor).
create policy "shopify_orders_select" on public.shopify_orders for select to authenticated
  using ((select public.has_workspace_role(workspace_id, 'viewer')));

-- Atribución: ver viewer; enlaces UTM los crea un editor; los códigos de descuento solo el servidor (tras crearlos en Shopify).
create policy "commerce_attributions_select" on public.commerce_attributions for select to authenticated
  using ((select public.has_workspace_role(workspace_id, 'viewer')));
create policy "commerce_attributions_insert_editor" on public.commerce_attributions for insert to authenticated
  with check ((select public.has_workspace_role(workspace_id, 'editor')) and kind = 'utm' and created_by = (select auth.uid()));
create policy "commerce_attributions_delete_editor" on public.commerce_attributions for delete to authenticated
  using ((select public.has_workspace_role(workspace_id, 'editor')));

-- Programaciones de informes: ver viewer; gestionar editor.
create policy "report_schedules_select" on public.report_schedules for select to authenticated
  using ((select public.has_workspace_role(workspace_id, 'viewer')));
create policy "report_schedules_insert_editor" on public.report_schedules for insert to authenticated
  with check ((select public.has_workspace_role(workspace_id, 'editor')) and created_by = (select auth.uid()));
create policy "report_schedules_update_editor" on public.report_schedules for update to authenticated
  using ((select public.has_workspace_role(workspace_id, 'editor'))) with check ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "report_schedules_delete_editor" on public.report_schedules for delete to authenticated
  using ((select public.has_workspace_role(workspace_id, 'editor')));

-- Bajas: un editor puede comprobar (hash) si un email se dio de baja; solo el servidor inserta.
create policy "report_unsubscribes_select" on public.report_unsubscribes for select to authenticated
  using ((select public.has_workspace_role(workspace_id, 'editor')));

-- API keys: cada usuario ve solo las suyas (alta y revocación vía funciones).
create policy "mcp_api_keys_select_own" on public.mcp_api_keys for select to authenticated
  using (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['shopify_stores','shopify_store_tokens','shopify_orders','commerce_attributions',
                           'report_schedules','report_unsubscribes','mcp_api_keys','mcp_rate_limits']
  loop
    execute format('create policy "mfa_required" on public.%I as restrictive for all to authenticated using ((select public.mfa_satisfied()))', t);
  end loop;
end $$;
