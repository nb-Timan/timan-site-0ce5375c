alter table public.crm_leads
  add column if not exists pipeline_value_snapshot numeric not null default 0,
  add column if not exists pipeline_value_snapshot_reason text,
  add column if not exists pipeline_value_snapshot_updated_at timestamptz;

comment on column public.crm_leads.pipeline_value_snapshot is
  'Cached pipeline value calculated by the application TypeScript helper getLeadPipelineValue(). Do not duplicate product price logic in SQL.';

comment on column public.crm_leads.pipeline_value_snapshot_reason is
  'Reason selected by the application when calculating pipeline_value_snapshot.';

comment on column public.crm_leads.pipeline_value_snapshot_updated_at is
  'Timestamp for the latest application-calculated pipeline_value_snapshot update.';
