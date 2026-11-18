-- Funciones internas (triggers) no deben ser invocables por RPC.
revoke execute on function public.handle_new_user() from authenticated, anon, public;
revoke execute on function public.set_updated_at() from authenticated, anon, public;
revoke execute on function public.brand_kit_workspace_guard() from authenticated, anon, public;
revoke execute on function public.project_workspace_guard() from authenticated, anon, public;
revoke execute on function public.workspace_plan_guard() from authenticated, anon, public;
