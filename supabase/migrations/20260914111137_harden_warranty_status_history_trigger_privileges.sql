-- Trigger functions are not browser APIs. Only the owning trigger and the
-- service role may execute this SECURITY DEFINER helper.
revoke all on function public.record_warranty_submission_status_history() from public;
revoke execute on function public.record_warranty_submission_status_history() from anon;
revoke execute on function public.record_warranty_submission_status_history() from authenticated;
grant execute on function public.record_warranty_submission_status_history() to service_role;
