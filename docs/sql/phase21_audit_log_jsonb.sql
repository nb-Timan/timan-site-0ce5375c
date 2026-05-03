-- Phase 21: structured budget audit
-- Run in Supabase SQL Editor.
--
-- 1) Convert old_value / new_value from text → jsonb so we can store
--    structured budget cell snapshots. Existing text values are wrapped as
--    json strings via to_jsonb so no data is lost.
-- 2) Add a SELECT policy so a Timan Sælger may read their own budget audit
--    rows (record_type = 'crm_budget' AND seller_context matches their email
--    or initials). Backend keeps full read access via the existing policy.
--    External roles get nothing.

alter table public.audit_log
  alter column old_value type jsonb using
    case
      when old_value is null then null
      when old_value ~ '^[\[{]' then old_value::jsonb
      else to_jsonb(old_value)
    end;

alter table public.audit_log
  alter column new_value type jsonb using
    case
      when new_value is null then null
      when new_value ~ '^[\[{]' then new_value::jsonb
      else to_jsonb(new_value)
    end;

-- Helpful index for cell-level lookups (year/seller/product/month/type lives
-- inside new_value->>'cell_key' once written — see audit-log-store.ts).
create index if not exists audit_log_cell_key_idx
  on public.audit_log ((new_value->>'cell_key'))
  where record_type = 'crm_budget';

create index if not exists audit_log_record_type_idx
  on public.audit_log (record_type);

-- Allow sellers to read their own budget audit rows.
drop policy if exists "audit_log read budget for seller" on public.audit_log;
create policy "audit_log read budget for seller"
on public.audit_log
for select
to authenticated
using (
  record_type = 'crm_budget'
  and exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid()
      and (
        lower(coalesce(au.email, '')) = lower(coalesce(audit_log.seller_context, ''))
        or lower(coalesce(au.email, '')) = lower(coalesce(audit_log.actor_email, ''))
      )
  )
);
