-- A budget reference is contextual metadata for one CRM lead. Keep the
-- existing lead delete flow canonical while preventing orphan references.
alter table public.budget_references
  add constraint budget_references_lead_id_crm_leads_fkey
  foreign key (lead_id)
  references public.crm_leads(id)
  on delete cascade
  not valid;

alter table public.budget_references
  validate constraint budget_references_lead_id_crm_leads_fkey;
