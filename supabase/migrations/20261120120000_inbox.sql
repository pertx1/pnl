-- =============================================================================
-- Kreo · Fase 3 · Bandeja unificada (Instagram DMs, Gmail, Outlook) y Clipper.
-- - Tokens OAuth cifrados en la aplicación (AES-256-GCM) en una tabla SIN políticas → solo service_role.
-- - Caché mínima: metadatos del hilo + contenido de mensajes con caducidad (30 días, purga diaria con Inngest).
-- - Escrituras de contenido solo desde el servidor (service_role) tras comprobar permisos con la sesión del usuario.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Conexiones de la bandeja (una por buzón / cuenta de Instagram y proyecto)
-- -----------------------------------------------------------------------------
create table public.inbox_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  channel text not null check (channel in ('instagram', 'gmail', 'outlook')),
  external_id text not null check (char_length(external_id) <= 320),    -- id de la cuenta IG o dirección de email
  display_name text check (char_length(display_name) <= 200),
  social_account_id uuid references public.social_accounts (id) on delete cascade,  -- solo Instagram
  status text not null default 'active' check (status in ('active', 'expired', 'revoked', 'error')),
  granted_scopes text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,    -- p. ej. page_id (IG). Nunca tokens.
  connected_by uuid references auth.users (id) on delete set null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, channel, external_id)
);
create index inbox_connections_workspace_idx on public.inbox_connections (workspace_id);
create index inbox_connections_project_idx on public.inbox_connections (project_id);
create index inbox_connections_social_idx on public.inbox_connections (social_account_id);
create index inbox_connections_connected_by_idx on public.inbox_connections (connected_by);
create index inbox_connections_external_idx on public.inbox_connections (channel, external_id);
create trigger inbox_connections_updated_at before update on public.inbox_connections
  for each row execute function public.set_updated_at();
create trigger inbox_connections_ws before insert or update of workspace_id, project_id on public.inbox_connections
  for each row execute function public.enforce_project_workspace();

-- Tokens cifrados. RLS sin políticas: solo service_role.
create table public.inbox_connection_tokens (
  connection_id uuid primary key references public.inbox_connections (id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  access_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Hilos (metadatos) y mensajes (contenido con caducidad)
-- -----------------------------------------------------------------------------
create table public.inbox_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  connection_id uuid not null references public.inbox_connections (id) on delete cascade,
  external_thread_id text not null check (char_length(external_thread_id) <= 300),
  subject text check (char_length(subject) <= 300),
  counterpart_name text check (char_length(counterpart_name) <= 200),
  counterpart_handle text check (char_length(counterpart_handle) <= 320),   -- @usuario o email
  snippet text check (char_length(snippet) <= 300),                         -- se borra con los mensajes (30 días)
  last_message_at timestamptz,
  last_inbound_at timestamptz,          -- ventana de 24 h de Instagram
  status text not null default 'open' check (status in ('open', 'archived')),
  unread boolean not null default true,
  needs_reply boolean not null default false,
  replied_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,   -- ids técnicos (historyId, conversationId…). Sin contenido.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_thread_id)
);
create index inbox_threads_project_idx on public.inbox_threads (project_id, last_message_at desc);
create index inbox_threads_workspace_idx on public.inbox_threads (workspace_id);
create index inbox_threads_connection_idx on public.inbox_threads (connection_id);
create trigger inbox_threads_updated_at before update on public.inbox_threads
  for each row execute function public.set_updated_at();
create trigger inbox_threads_ws before insert or update of workspace_id, project_id on public.inbox_threads
  for each row execute function public.enforce_project_workspace();

create table public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  thread_id uuid not null references public.inbox_threads (id) on delete cascade,
  external_message_id text not null check (char_length(external_message_id) <= 300),
  direction text not null check (direction in ('in', 'out')),
  sender_name text check (char_length(sender_name) <= 200),
  body_text text not null default '' check (char_length(body_text) <= 20000),
  sent_at timestamptz not null,
  sent_by uuid references auth.users (id) on delete set null,       -- quién pulsó "Enviar" en Kreo
  ai_assisted boolean not null default false,                       -- partió de una sugerencia de IA
  metadata jsonb not null default '{}'::jsonb,                      -- p. ej. Message-ID (email) para responder en el hilo
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  unique (thread_id, external_message_id)
);
create index inbox_messages_thread_idx on public.inbox_messages (thread_id, sent_at);
create index inbox_messages_workspace_idx on public.inbox_messages (workspace_id);
create index inbox_messages_sent_by_idx on public.inbox_messages (sent_by);
create index inbox_messages_expires_idx on public.inbox_messages (expires_at);

-- Borrador de respuesta (uno por hilo). La IA solo propone: nada se envía sin pulsar "Enviar".
create table public.inbox_drafts (
  thread_id uuid primary key references public.inbox_threads (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 10000),
  ai_generated boolean not null default false,
  prompt_version text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index inbox_drafts_workspace_idx on public.inbox_drafts (workspace_id);
create index inbox_drafts_updated_by_idx on public.inbox_drafts (updated_by);

-- Coherencia del workspace en filas hijas de un hilo.
create or replace function public.enforce_thread_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.inbox_threads t where t.id = new.thread_id and t.workspace_id = new.workspace_id) then
    raise exception 'workspace_mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger inbox_messages_ws before insert or update of workspace_id, thread_id on public.inbox_messages
  for each row execute function public.enforce_thread_workspace();
create trigger inbox_drafts_ws before insert or update of workspace_id, thread_id on public.inbox_drafts
  for each row execute function public.enforce_thread_workspace();

-- Los editores solo pueden cambiar el estado del hilo (archivar, leído), nunca su contenido ni su origen.
create or replace function public.guard_inbox_thread_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if new.workspace_id is distinct from old.workspace_id or new.project_id is distinct from old.project_id
     or new.connection_id is distinct from old.connection_id or new.external_thread_id is distinct from old.external_thread_id
     or new.subject is distinct from old.subject or new.counterpart_name is distinct from old.counterpart_name
     or new.counterpart_handle is distinct from old.counterpart_handle or new.snippet is distinct from old.snippet
     or new.last_message_at is distinct from old.last_message_at or new.last_inbound_at is distinct from old.last_inbound_at
     or new.needs_reply is distinct from old.needs_reply or new.replied_at is distinct from old.replied_at
     or new.metadata is distinct from old.metadata then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger inbox_threads_guard before update on public.inbox_threads
  for each row execute function public.guard_inbox_thread_update();

-- -----------------------------------------------------------------------------
-- Clipper: trabajos (un vídeo largo propio) y segmentos propuestos / renderizados
-- -----------------------------------------------------------------------------
create table public.clip_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  source_asset_id uuid references public.assets (id) on delete set null,
  title text check (char_length(title) <= 200),
  status text not null default 'transcribing' check (status in ('transcribing', 'analyzing', 'ready', 'failed')),
  declared_duration_s numeric not null check (declared_duration_s > 0 and declared_duration_s <= 3600),
  duration_s numeric,
  language text check (char_length(language) <= 10),
  transcript jsonb,                     -- [{s, e, t}] segmentos con tiempos (contenido del propio usuario)
  generation_id uuid references public.ai_generations (id) on delete set null,
  provider_state jsonb not null default '{}'::jsonb,   -- URLs de la cola de fal (solo servidor)
  error_code text,
  rights_confirmed_at timestamptz not null,           -- casilla obligatoria "es mi contenido o tengo derechos"
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clip_jobs_project_idx on public.clip_jobs (project_id, created_at desc);
create index clip_jobs_workspace_idx on public.clip_jobs (workspace_id);
create index clip_jobs_source_idx on public.clip_jobs (source_asset_id);
create index clip_jobs_generation_idx on public.clip_jobs (generation_id);
create index clip_jobs_created_by_idx on public.clip_jobs (created_by);
create index clip_jobs_status_idx on public.clip_jobs (status) where status in ('transcribing', 'analyzing');
create trigger clip_jobs_updated_at before update on public.clip_jobs
  for each row execute function public.set_updated_at();
create trigger clip_jobs_ws before insert or update of workspace_id, project_id on public.clip_jobs
  for each row execute function public.enforce_project_workspace();

create table public.clip_segments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.clip_jobs (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  start_s numeric not null check (start_s >= 0),
  end_s numeric not null,
  title text not null check (char_length(title) <= 200),
  hook text check (char_length(hook) <= 300),
  reason text check (char_length(reason) <= 500),
  score int not null default 0 check (score between 0 and 100),
  status text not null default 'proposed' check (status in ('proposed', 'rendering', 'done', 'failed')),
  render_step text check (render_step in ('trim', 'scale', 'subtitle')),
  subtitles boolean not null default true,
  generation_id uuid references public.ai_generations (id) on delete set null,
  asset_id uuid references public.assets (id) on delete set null,
  provider_state jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_s > start_s and end_s - start_s <= 180)
);
create index clip_segments_job_idx on public.clip_segments (job_id, score desc);
create index clip_segments_workspace_idx on public.clip_segments (workspace_id);
create index clip_segments_project_idx on public.clip_segments (project_id);
create index clip_segments_generation_idx on public.clip_segments (generation_id);
create index clip_segments_asset_idx on public.clip_segments (asset_id);
create index clip_segments_rendering_idx on public.clip_segments (status) where status = 'rendering';
create trigger clip_segments_updated_at before update on public.clip_segments
  for each row execute function public.set_updated_at();
create trigger clip_segments_ws before insert or update of workspace_id, project_id on public.clip_segments
  for each row execute function public.enforce_project_workspace();

-- Los editores solo pueden ajustar tiempos/título de un segmento propuesto; el resto lo cambia el servidor.
create or replace function public.guard_clip_segment_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if old.status <> 'proposed'
     or new.status is distinct from old.status or new.render_step is distinct from old.render_step
     or new.generation_id is distinct from old.generation_id or new.asset_id is distinct from old.asset_id
     or new.provider_state is distinct from old.provider_state or new.error_code is distinct from old.error_code
     or new.job_id is distinct from old.job_id or new.workspace_id is distinct from old.workspace_id
     or new.project_id is distinct from old.project_id or new.score is distinct from old.score then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger clip_segments_guard before update on public.clip_segments
  for each row execute function public.guard_clip_segment_update();

-- -----------------------------------------------------------------------------
-- Permisos de funciones
-- -----------------------------------------------------------------------------
revoke execute on function public.enforce_thread_workspace() from public, anon, authenticated;
revoke execute on function public.guard_inbox_thread_update() from public, anon, authenticated;
revoke execute on function public.guard_clip_segment_update() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.inbox_connections enable row level security;
alter table public.inbox_connection_tokens enable row level security;   -- sin políticas: solo service_role
alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.inbox_drafts enable row level security;
alter table public.clip_jobs enable row level security;
alter table public.clip_segments enable row level security;

-- Conexiones: los miembros las ven; solo un admin las borra (la desconexión revoca en el servidor).
create policy "inbox_connections_select" on public.inbox_connections for select to authenticated
  using ((select public.has_workspace_role(workspace_id, 'viewer')));
create policy "inbox_connections_delete_admin" on public.inbox_connections for delete to authenticated
  using ((select public.has_workspace_role(workspace_id, 'admin')));

-- Hilos: lectura para miembros; editor cambia estado (archivar / leído). Altas y contenido: servidor.
create policy "inbox_threads_select" on public.inbox_threads for select to authenticated
  using ((select public.has_workspace_role(workspace_id, 'viewer')));
create policy "inbox_threads_update_editor" on public.inbox_threads for update to authenticated
  using ((select public.has_workspace_role(workspace_id, 'editor')))
  with check ((select public.has_workspace_role(workspace_id, 'editor')));

-- Mensajes: solo lectura para miembros.
create policy "inbox_messages_select" on public.inbox_messages for select to authenticated
  using ((select public.has_workspace_role(workspace_id, 'viewer')));

-- Borradores: editores los leen y editan.
create policy "inbox_drafts_select" on public.inbox_drafts for select to authenticated
  using ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "inbox_drafts_insert_editor" on public.inbox_drafts for insert to authenticated
  with check ((select public.has_workspace_role(workspace_id, 'editor')) and updated_by = (select auth.uid()) and ai_generated = false);
create policy "inbox_drafts_update_editor" on public.inbox_drafts for update to authenticated
  using ((select public.has_workspace_role(workspace_id, 'editor')))
  with check ((select public.has_workspace_role(workspace_id, 'editor')) and updated_by = (select auth.uid()));
create policy "inbox_drafts_delete_editor" on public.inbox_drafts for delete to authenticated
  using ((select public.has_workspace_role(workspace_id, 'editor')));

-- Clipper: lectura para miembros; editor borra trabajos y ajusta segmentos propuestos. Altas: servidor.
create policy "clip_jobs_select" on public.clip_jobs for select to authenticated
  using ((select public.has_workspace_role(workspace_id, 'viewer')));
create policy "clip_jobs_delete_editor" on public.clip_jobs for delete to authenticated
  using ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "clip_segments_select" on public.clip_segments for select to authenticated
  using ((select public.has_workspace_role(workspace_id, 'viewer')));
create policy "clip_segments_update_editor" on public.clip_segments for update to authenticated
  using ((select public.has_workspace_role(workspace_id, 'editor')))
  with check ((select public.has_workspace_role(workspace_id, 'editor')));

-- 2FA obligatorio si el usuario lo tiene activado (política restrictiva).
do $$
declare t text;
begin
  foreach t in array array['inbox_connections','inbox_connection_tokens','inbox_threads','inbox_messages','inbox_drafts','clip_jobs','clip_segments']
  loop
    execute format('create policy "mfa_required" on public.%I as restrictive for all to authenticated using ((select public.mfa_satisfied()))', t);
  end loop;
end $$;
