-- =============================================================================
-- Kreo · Correcciones de cumplimiento (revisión seguridad-legal 2026-11-19, módulos de la Fase 2-4).
-- Aplicada el 2026-11-19.
-- =============================================================================

-- 1) accept_invitation: exigir email CONFIRMADO.
--    Antes solo se comparaba auth.users.email con el email invitado. Si en algún momento se desactiva la
--    confirmación de email en Supabase Auth (o se usa un proveedor que no la exige), cualquiera podría registrarse
--    con el email de la persona invitada y entrar en el workspace con el enlace. Defensa en profundidad.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_inv public.workspace_invitations;
  v_email text;
  v_confirmed timestamptz;
  v_max int;
  v_members int;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'mfa_required' using errcode = '42501';
  end if;

  select * into v_inv from public.workspace_invitations where token_hash = public.invitation_hash(coalesce(p_token, '')) for update;
  if not found or v_inv.revoked_at is not null or v_inv.accepted_at is not null then
    raise exception 'invitation_invalid' using errcode = 'P0001';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;

  select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = v_user;
  if v_email is distinct from lower(v_inv.email::text) or v_confirmed is null then
    raise exception 'invitation_email_mismatch' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.workspace_members where workspace_id = v_inv.workspace_id and user_id = v_user) then
    update public.workspace_invitations set accepted_at = now(), accepted_by = v_user where id = v_inv.id;
    return v_inv.workspace_id;
  end if;

  select p.max_members into v_max
  from public.workspaces w join public.plans p on p.id = w.plan_id
  where w.id = v_inv.workspace_id
  for update of w;
  select count(*) into v_members from public.workspace_members where workspace_id = v_inv.workspace_id;
  if v_members >= v_max then
    raise exception 'plan_limit_members' using errcode = 'P0001';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role) values (v_inv.workspace_id, v_user, v_inv.role);
  update public.workspace_invitations set accepted_at = now(), accepted_by = v_user where id = v_inv.id;
  perform public.log_activity(v_inv.workspace_id, 'member.joined', 'member', v_user::text, jsonb_build_object('role', v_inv.role));
  return v_inv.workspace_id;
end;
$$;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
