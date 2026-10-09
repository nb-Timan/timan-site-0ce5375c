-- This function is only invoked by the crm_demo_leads trigger. It must not
-- be available as a direct authenticated/Data API call.
revoke all on function public.sync_crm_demo_calendar() from public, anon, authenticated;
