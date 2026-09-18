-- Supabase can retain explicit default grants for anon alongside PUBLIC.
-- Lead-note priority is a signed-in CRM action only.
revoke all on function public.set_crm_lead_note_priority(uuid, integer) from anon;
revoke all on function public.set_crm_lead_note_priority(uuid, integer) from public;
grant execute on function public.set_crm_lead_note_priority(uuid, integer) to authenticated;
