-- Índices para claves foráneas (borrados en cascada / set null eficientes).
create index if not exists activity_log_actor_idx on public.activity_log (actor_id);
create index if not exists credit_ledger_created_by_idx on public.credit_ledger (created_by);
create index if not exists projects_created_by_idx on public.projects (created_by);
create index if not exists workspaces_created_by_idx on public.workspaces (created_by);
create index if not exists workspaces_plan_idx on public.workspaces (plan_id);
