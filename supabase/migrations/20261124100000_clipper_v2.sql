-- =============================================================================
-- Clipper v2: puntuación de viralidad desglosada, opciones de render (formato, encuadre, plantilla de subtítulos)
-- y subtítulos .srt de cada clip generado (para subirlos como subtítulos, p. ej. a YouTube).
-- Sin tablas nuevas: clip_segments ya tiene RLS (lectura miembros, edición editor) + "mfa_required" restrictiva
-- (20261120120000_inbox.sql), que cubren también estas columnas.
-- =============================================================================

alter table public.clip_segments
  add column if not exists score_breakdown jsonb not null default '{}'::jsonb,   -- {hook, pacing, value, trend} 0–100 (total en score)
  add column if not exists render_options jsonb not null default '{}'::jsonb,    -- formato, encuadre, plantilla (lo fija el servidor)
  add column if not exists srt text check (char_length(srt) <= 200000),          -- subtítulos del clip, tiempos relativos al clip
  add column if not exists rendered_at timestamptz;

comment on column public.clip_segments.srt is
  'Subtítulos SRT del clip generado (asset_id). Tiempos relativos al inicio del clip. Lo usa la subida de subtítulos a YouTube.';

-- Los editores solo ajustan tiempos/título de un momento propuesto o fallido (antes solo «proposed»: el ajuste de un
-- render fallido no se podía guardar). El resto (estado, render, puntuación, opciones, .srt) solo lo cambia el servidor.
create or replace function public.guard_clip_segment_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if old.status not in ('proposed', 'failed')
     or new.status is distinct from old.status or new.render_step is distinct from old.render_step
     or new.generation_id is distinct from old.generation_id or new.asset_id is distinct from old.asset_id
     or new.provider_state is distinct from old.provider_state or new.error_code is distinct from old.error_code
     or new.job_id is distinct from old.job_id or new.workspace_id is distinct from old.workspace_id
     or new.project_id is distinct from old.project_id or new.score is distinct from old.score
     or new.score_breakdown is distinct from old.score_breakdown or new.render_options is distinct from old.render_options
     or new.srt is distinct from old.srt or new.rendered_at is distinct from old.rendered_at
     or new.subtitles is distinct from old.subtitles then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_clip_segment_update() from public, anon, authenticated;
