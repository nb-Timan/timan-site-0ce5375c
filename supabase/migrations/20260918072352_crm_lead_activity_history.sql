-- Extend the existing append-only CRM activity stream. New lead notes are
-- comments with a first-class lead relation; no parallel notes table exists.
alter table public.crm_activities
  add column if not exists lead_id uuid references public.crm_leads(id) on delete set null;

create index if not exists crm_activities_lead_comment_created_idx
  on public.crm_activities (lead_id, created_at desc)
  where activity_type = 'comment';

-- Preserve and normalize prior activities that already carried a deterministic
-- lead relation in their JSON metadata.
update public.crm_activities activity
set lead_id = lead.id
from public.crm_leads lead
where activity.lead_id is null
  and activity.meta ? 'lead_id'
  and activity.meta ->> 'lead_id' = lead.id::text;

-- The existing activity policy covers account/configuration-based history.
-- Lead comments additionally inherit exactly the existing crm_leads RLS scope.
drop policy if exists crm_activities_lead_history_scoped_access on public.crm_activities;
create policy crm_activities_lead_history_scoped_access
  on public.crm_activities
  for all
  to authenticated
  using (
    lead_id is not null
    and exists (
      select 1
      from public.crm_leads lead
      where lead.id = crm_activities.lead_id
    )
  )
  with check (
    lead_id is not null
    and exists (
      select 1
      from public.crm_leads lead
      where lead.id = crm_activities.lead_id
    )
  );
