-- Historical lead comments stay in the canonical CRM activity stream. The
-- source identifiers make the one-time import auditable and idempotent without
-- changing normal portal notes or exposing a permanent import endpoint.
create unique index if not exists crm_activities_legacy_comment_source_unique
  on public.crm_activities (
    (meta ->> 'source_item_id'),
    (meta ->> 'source_comment_id')
  )
  where activity_type = 'comment'
    and meta ->> 'source' = 'legacy_leads_csv';
