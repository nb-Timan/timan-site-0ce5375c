-- Keep provenance lookups and FK maintenance efficient without changing access semantics.
create index if not exists crm_working_budget_units_original_dealer_idx
  on public.crm_working_budget_units (original_dealer_account_id)
  where original_dealer_account_id is not null;
