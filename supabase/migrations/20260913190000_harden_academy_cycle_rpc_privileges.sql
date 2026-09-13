-- Supabase grants EXECUTE to API roles by default. Academy's lifecycle is
-- deliberately RPC-only, so expose only the authenticated entry points and
-- keep internal state and audit helpers server-internal.

revoke all on function public.academy_is_backend() from anon, authenticated, service_role;
revoke all on function public.academy_current_user_id() from anon, authenticated, service_role;
revoke all on function public.academy_write_audit(text, public.academy_cycles, jsonb, jsonb, text[]) from anon, authenticated, service_role;
revoke all on function public.academy_activate_due_cycle(uuid) from anon, authenticated, service_role;
revoke all on function public.get_my_academy_cycle() from anon, authenticated, service_role;
revoke all on function public.record_academy_cycle_completion(uuid, text) from anon, authenticated, service_role;
revoke all on function public.admin_start_academy_cycle(uuid, text, timestamptz) from anon, authenticated, service_role;
revoke all on function public.admin_reset_academy_cycle(uuid) from anon, authenticated, service_role;
revoke all on function public.admin_set_academy_cycle_cadence(uuid, text, timestamptz) from anon, authenticated, service_role;
revoke all on function public.admin_get_academy_cycle_history(uuid) from anon, authenticated, service_role;

-- RLS predicates invoke these narrow identity helpers for direct reads.
grant execute on function public.academy_is_backend() to authenticated;
grant execute on function public.academy_current_user_id() to authenticated;

-- End-user reads/completions and Backend-only lifecycle calls. The latter
-- remain protected by academy_is_backend() inside their security-definer RPC.
grant execute on function public.get_my_academy_cycle() to authenticated;
grant execute on function public.record_academy_cycle_completion(uuid, text) to authenticated;
grant execute on function public.admin_start_academy_cycle(uuid, text, timestamptz) to authenticated;
grant execute on function public.admin_reset_academy_cycle(uuid) to authenticated;
grant execute on function public.admin_set_academy_cycle_cadence(uuid, text, timestamptz) to authenticated;
grant execute on function public.admin_get_academy_cycle_history(uuid) to authenticated;
