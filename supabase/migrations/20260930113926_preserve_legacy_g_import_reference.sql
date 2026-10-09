-- Keep the already-deployed historical importer compatible while application
-- and Edge Function releases roll out. Only its explicit audit markers may
-- select the G-series; ordinary portal leads retain the L default.
create or replace function public.set_crm_legacy_import_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.notes like '%G-nummer: G-%'
    or new.notes like 'Historisk import fra LeadsData_%'
  then
    new.lead_reference_type := 'G';
  end if;
  return new;
end;
$$;

revoke all on function public.set_crm_legacy_import_reference() from public, anon, authenticated;

drop trigger if exists set_crm_legacy_import_reference on public.crm_leads;
create trigger set_crm_legacy_import_reference
before insert or update of lead_no, notes
on public.crm_leads
for each row execute function public.set_crm_legacy_import_reference();
