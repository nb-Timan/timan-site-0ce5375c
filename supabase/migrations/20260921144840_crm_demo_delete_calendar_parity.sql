-- Cancel the linked event before ON DELETE SET NULL removes demo_lead_id.
-- The existing AFTER DELETE trigger still reconciles the lead's stage.
create trigger cancel_crm_demo_calendar_before_delete
before delete on public.crm_demo_leads
for each row execute function public.unlink_deleted_crm_demo();
