-- =============================================================================
-- Kreo · Bandeja · Comentarios de Instagram (API oficial de Graph: /{ig-user-id}/media, /{ig-media-id}/comments,
-- /{ig-comment-id}/replies y POST /{ig-comment-id}?hide=…; permiso instagram_manage_comments).
--
-- Minimización (RGPD):
--  - Solo publicaciones PROPIAS con comentarios de los últimos 30 días (máx. 25 publicaciones por sincronización).
--  - De terceros guardamos solo @usuario, texto (≤ 2.200, el máximo de Instagram) y fecha. Sin IGSID, sin foto, sin likes.
--  - Caducidad: `expires_at` = fecha del comentario + 30 días (purga diaria en Inngest `inbox-retention`).
--    Las publicaciones sin actividad en 30 días se borran (en cascada, sus comentarios).
-- Escrituras de contenido: solo el servidor (service_role) tras comprobar el rol con la sesión del usuario.
-- Los editores solo pueden cambiar `unread` (marcar como leído / no leído): lo garantiza un trigger.
-- NO aplicar sin revisión: la aplica Oier (o Claude con su permiso) en el panel de Supabase.
-- =============================================================================

-- Publicaciones propias con comentarios (una fila por publicación y conexión de la Bandeja).
create table public.inbox_comment_media (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  connection_id uuid not null references public.inbox_connections (id) on delete cascade,
  external_media_id text not null check (char_length(external_media_id) <= 100),
  media_type text check (char_length(media_type) <= 40),            -- IMAGE / VIDEO / CAROUSEL_ALBUM
  product_type text check (char_length(product_type) <= 40),        -- FEED / REELS / STORY / AD
  caption_snippet text check (char_length(caption_snippet) <= 300), -- pie de foto propio, recortado
  permalink text check (char_length(permalink) <= 500),
  thumbnail_url text check (char_length(thumbnail_url) <= 2000),    -- URL temporal del CDN de Instagram (se renueva al sincronizar)
  posted_at timestamptz,
  comments_count int not null default 0 check (comments_count >= 0),
  comments_synced_count int,                                        -- comments_count de la última lectura (evita llamadas si no cambia)
  last_comment_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_media_id)
);
create index inbox_comment_media_project_idx on public.inbox_comment_media (project_id, last_comment_at desc);
create index inbox_comment_media_workspace_idx on public.inbox_comment_media (workspace_id);
create index inbox_comment_media_connection_idx on public.inbox_comment_media (connection_id);
create trigger inbox_comment_media_updated_at before update on public.inbox_comment_media
  for each row execute function public.set_updated_at();
create trigger inbox_comment_media_ws before insert or update of workspace_id, project_id on public.inbox_comment_media
  for each row execute function public.enforce_project_workspace();

-- Comentarios (y respuestas) de esas publicaciones.
create table public.inbox_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  connection_id uuid not null references public.inbox_connections (id) on delete cascade,
  media_id uuid not null references public.inbox_comment_media (id) on delete cascade,
  external_comment_id text not null check (char_length(external_comment_id) <= 100),
  parent_external_id text check (char_length(parent_external_id) <= 100),   -- null = comentario de primer nivel
  author_username text check (char_length(author_username) <= 100),
  is_own boolean not null default false,                                    -- lo escribió la propia cuenta
  body_text text not null default '' check (char_length(body_text) <= 2200),
  commented_at timestamptz not null,
  hidden boolean not null default false,
  unread boolean not null default true,
  replied_at timestamptz,                                                   -- la cuenta ya respondió en este hilo
  sent_by uuid references auth.users (id) on delete set null,               -- quién pulsó «Responder» en Kreo
  ai_assisted boolean not null default false,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_comment_id)
);
create index inbox_comments_media_idx on public.inbox_comments (media_id, commented_at);
create index inbox_comments_project_unread_idx on public.inbox_comments (project_id) where unread;
create index inbox_comments_workspace_idx on public.inbox_comments (workspace_id);
create index inbox_comments_connection_idx on public.inbox_comments (connection_id);
create index inbox_comments_sent_by_idx on public.inbox_comments (sent_by);
create index inbox_comments_expires_idx on public.inbox_comments (expires_at);
create trigger inbox_comments_updated_at before update on public.inbox_comments
  for each row execute function public.set_updated_at();
create trigger inbox_comments_ws before insert or update of workspace_id, project_id on public.inbox_comments
  for each row execute function public.enforce_project_workspace();

-- Los editores solo pueden marcar como leído / no leído. Todo lo demás (ocultar, responder, contenido) pasa por el
-- servidor, que primero lo hace en Instagram con la API oficial.
create or replace function public.guard_inbox_comment_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if new.workspace_id is distinct from old.workspace_id or new.project_id is distinct from old.project_id
     or new.connection_id is distinct from old.connection_id or new.media_id is distinct from old.media_id
     or new.external_comment_id is distinct from old.external_comment_id
     or new.parent_external_id is distinct from old.parent_external_id
     or new.author_username is distinct from old.author_username or new.is_own is distinct from old.is_own
     or new.body_text is distinct from old.body_text or new.commented_at is distinct from old.commented_at
     or new.hidden is distinct from old.hidden or new.replied_at is distinct from old.replied_at
     or new.sent_by is distinct from old.sent_by or new.ai_assisted is distinct from old.ai_assisted
     or new.expires_at is distinct from old.expires_at then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger inbox_comments_guard before update on public.inbox_comments
  for each row execute function public.guard_inbox_comment_update();
revoke execute on function public.guard_inbox_comment_update() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.inbox_comment_media enable row level security;
alter table public.inbox_comments enable row level security;

create policy "inbox_comment_media_select" on public.inbox_comment_media for select to authenticated
  using ((select public.has_workspace_role(workspace_id, 'viewer')));

create policy "inbox_comments_select" on public.inbox_comments for select to authenticated
  using ((select public.has_workspace_role(workspace_id, 'viewer')));
create policy "inbox_comments_update_editor" on public.inbox_comments for update to authenticated
  using ((select public.has_workspace_role(workspace_id, 'editor')))
  with check ((select public.has_workspace_role(workspace_id, 'editor')));

-- 2FA exigido (igual que el resto de la Bandeja).
create policy "mfa_required" on public.inbox_comment_media as restrictive for all to authenticated
  using ((select public.mfa_satisfied()));
create policy "mfa_required" on public.inbox_comments as restrictive for all to authenticated
  using ((select public.mfa_satisfied()));

revoke all on table public.inbox_comment_media from anon;
revoke all on table public.inbox_comments from anon;
