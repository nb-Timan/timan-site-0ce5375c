-- Trigger-only Knowledge Quality functions must not be callable through PostgREST.
revoke all on function public.support_prevent_quality_event_mutation() from public, anon, authenticated;
revoke all on function public.support_record_quality_detection() from public, anon, authenticated;
revoke all on function public.support_enforce_knowledge_quality_approval() from public, anon, authenticated;

grant execute on function public.support_prevent_quality_event_mutation() to service_role;
grant execute on function public.support_record_quality_detection() to service_role;
grant execute on function public.support_enforce_knowledge_quality_approval() to service_role;
