-- Lock the repaired CRM lead sharing tables to the intended portal role.
-- RLS still enforces row access; these grants remove broad inherited/default
-- privileges that were present in live.

revoke all on table public.crm_lead_shares from anon;
revoke all on table public.crm_lead_share_audit_log from anon;
revoke all on table public.crm_lead_shares from public;
revoke all on table public.crm_lead_share_audit_log from public;

revoke all on table public.crm_lead_shares from authenticated;
revoke all on table public.crm_lead_share_audit_log from authenticated;

grant select, insert, update on table public.crm_lead_shares to authenticated;
grant select, insert on table public.crm_lead_share_audit_log to authenticated;
