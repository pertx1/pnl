-- =============================================================================
-- Kreo · Generaciones de IA: cobro de créditos ATÓMICO junto al registro de la generación.
-- =============================================================================

-- Inicia una generación (editor+): descuenta créditos y crea el registro en la MISMA transacción.
-- Idempotente por p_idempotency_key (un doble clic no cobra dos veces).
create or replace function public.start_ai_generation(
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
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws uuid;
  v_id uuid;
begin
  select workspace_id into v_ws from public.projects where id = p_project_id and archived_at is null;
  if v_ws is null or not public.has_workspace_role(v_ws, 'editor') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select ref_id::uuid into v_id from public.credit_ledger
  where idempotency_key = 'ai:' || p_idempotency_key and workspace_id = v_ws;
  if found then
    return v_id;
  end if;

  v_id := gen_random_uuid();
  insert into public.ai_generations (id, workspace_id, project_id, kind, provider, model, prompt, params, credits_cost, status, license, created_by)
  values (v_id, v_ws, p_project_id, p_kind, p_provider, p_model, p_prompt, coalesce(p_params, '{}'::jsonb), p_credits, 'running', coalesce(p_license, '{}'::jsonb), (select auth.uid()));

  if p_credits > 0 then
    perform public.consume_credits(v_ws, p_credits, 'ai_' || p_kind, 'ai:' || p_idempotency_key, 'ai_generation', v_id::text);
  end if;
  return v_id;
end;
$$;

revoke execute on function public.start_ai_generation(uuid, text, text, text, text, jsonb, int, jsonb, text) from public, anon;
grant execute on function public.start_ai_generation(uuid, text, text, text, text, jsonb, int, jsonb, text) to authenticated;
