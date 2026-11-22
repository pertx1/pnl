-- Plan interno "Fundador" (no público): límites prácticamente ilimitados para la cuenta del fundador.
-- Aplicado el 2026-11-22. La asignación del workspace se hizo a mano con rol de servicio (workspace_plan_guard).
insert into public.plans (id, name, max_projects, max_social_accounts, max_members, monthly_credits, is_public)
values ('founder', 'Fundador', 10000, 10000, 100, 0, false)
on conflict (id) do update set
  name = excluded.name,
  max_projects = excluded.max_projects,
  max_social_accounts = excluded.max_social_accounts,
  max_members = excluded.max_members,
  is_public = false;
