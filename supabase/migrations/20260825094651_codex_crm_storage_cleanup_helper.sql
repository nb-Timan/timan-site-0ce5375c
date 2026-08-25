-- Temporary locked helper created during the CRM reset run.
-- It was not granted to frontend roles and is dropped by the next migration.

create or replace function public.codex_delete_crm_lead_attachments_once()
returns integer
language plpgsql
volatile
security definer
set search_path = public, storage
as $$
declare
  v_deleted integer := 0;
begin
  delete from storage.objects where bucket_id = 'crm-lead-attachments';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.codex_delete_crm_lead_attachments_once() from public, anon, authenticated;
