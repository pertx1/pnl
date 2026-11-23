-- =============================================================================
-- Kreo · Arreglos de la revisión `seguridad-legal` del 2026-11-24.
--
-- Resumen semanal: los avisos `weekly_summary` ya guardados llevaban el nombre del canal y los suscriptores de
-- YouTube. Los avisos se conservan hasta 1 año, pero los datos de la API de YouTube solo pueden guardarse 30 días
-- (Developer Policies III.E.4.c) y deben borrarse en 7 días si se revoca el acceso (III.D.2). Desde este cambio el
-- servidor guarda solo el id de la cuenta y la página del aviso lee el resto en vivo; aquí se limpian los ya creados.
-- Idempotente. Solo datos: no cambia esquema ni permisos.
-- =============================================================================

update public.notifications n
set data = jsonb_set(
  n.data,
  '{youtube}',
  coalesce(
    (select jsonb_agg(jsonb_build_object('id', e -> 'id', 'label', '', 'subscribers', null, 'status', e -> 'status'))
       from jsonb_array_elements(n.data -> 'youtube') as e),
    '[]'::jsonb
  )
)
where n.type = 'weekly_summary'
  and jsonb_typeof(n.data -> 'youtube') = 'array'
  and exists (
    select 1 from jsonb_array_elements(n.data -> 'youtube') as e
    where coalesce(e ->> 'label', '') <> '' or (e -> 'subscribers') is distinct from 'null'::jsonb
  );
