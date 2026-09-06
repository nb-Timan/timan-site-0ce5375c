-- One-time forward-only repair for the submitted O-7002 record. Its legacy
-- T-4001 row lost the canonical lead_id before submission, so the normal
-- submitted-order transition had no lead to close. The submitted-order guard
-- is disabled only for this exact guarded update, then restored immediately.
alter table public.configurations disable trigger prevent_submitted_configurator_order_changes;

with repaired_configuration as (
  update public.configurations
  set lead_id = '72f270f4-cc62-422f-b67f-ad02c584c7fc',
      last_saved_at = now()
  where id = '925ae37c-2d1c-4435-8f6a-74b98011d68a'
    and quote_number = 'T-4001'
    and order_number = 'O-7002'
    and submitted_at is not null
    and order_sent_at is not null
    and lead_id is null
  returning id
)
update public.crm_leads
set incomplete_from_configurator = false,
    pipeline_stage = 'Won',
    next_activity = 'Closed with order',
    probability = 100,
    status = 'closed',
    updated_at = now()
where id = '72f270f4-cc62-422f-b67f-ad02c584c7fc'
  and exists (select 1 from repaired_configuration);

alter table public.configurations enable trigger prevent_submitted_configurator_order_changes;
