-- Server-only pre-launch QA archive. Historical case/item/receipt/media/event rows
-- remain intact. An approved, separately guarded data operation supplies case IDs;
-- this schema migration archives no cases and never resets an allocator.
create schema if not exists private;
create table if not exists private.loan_prelaunch_qa_archive (
  case_id uuid primary key references public.loan_cases(id) on delete restrict,
  original_loan_number text not null unique check (original_loan_number ~ '^U-[0-9]+$'),
  archived_at timestamptz not null default now(),
  authorization_reference text not null check (length(btrim(authorization_reference)) > 0),
  archive_reason text not null check (length(btrim(archive_reason)) > 0),
  original_case_checksum text not null check (original_case_checksum ~ '^[0-9a-f]{32}$')
);
alter table private.loan_prelaunch_qa_archive enable row level security;
revoke all on private.loan_prelaunch_qa_archive from public, anon, authenticated, service_role;
comment on table private.loan_prelaunch_qa_archive is
  'Explicitly approved synthetic pre-launch cases, excluded from all operational Loans access. Original IDs, U-numbers, immutable history and private evidence remain reserved. Server administrator only; no frontend archive or purge API.';

-- Keep the existing role/ownership checks, grants and RLS policies. Only cases
-- explicitly marked in the private archive gain an additional deny condition.
create or replace function public.loan_can_view_case(p_case_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_access_loans() and exists (
    select 1 from public.loan_cases c
    join public.app_users u on u.auth_user_id = auth.uid()
    join public.dealer_accounts d on d.id = c.dealer_account_id
    where c.id = p_case_id
      and not exists (select 1 from private.loan_prelaunch_qa_archive q where q.case_id = c.id)
      and (
      u.portal_role::text = 'timan_backend'
      or (u.portal_role::text in ('timan_seller','timan_service') and (c.responsible_user_id = u.id or c.created_by = u.id))
      or (u.portal_role::text in ('timan_dealer','timan_service_partner')
          and nullif(btrim(u.dealer_number), '') in (nullif(btrim(d.account_number), ''), nullif(btrim(d.dealer_number), '')))
    )
  )
$$;

create or replace function public.loan_can_manage_case(p_case_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_access_loans() and exists (
    select 1 from public.loan_cases c join public.app_users u on u.auth_user_id = auth.uid()
    where c.id = p_case_id
      and not exists (select 1 from private.loan_prelaunch_qa_archive q where q.case_id = c.id)
      and (
      u.portal_role::text = 'timan_backend'
      or (u.portal_role::text in ('timan_seller','timan_service') and (c.responsible_user_id = u.id or c.created_by = u.id))
    )
  )
$$;

create or replace function public.loan_can_accept_case(p_case_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_access_loans() and exists (
    select 1 from public.loan_cases c
    join public.app_users u on u.auth_user_id = auth.uid()
    join public.dealer_accounts d on d.id = c.dealer_account_id
    where c.id = p_case_id
      and not exists (select 1 from private.loan_prelaunch_qa_archive q where q.case_id = c.id)
      and (
      (u.portal_role::text in ('timan_backend','timan_seller','timan_service')
        and (u.portal_role::text = 'timan_backend' or c.responsible_user_id = u.id or c.created_by = u.id))
      or (u.portal_role::text in ('timan_dealer','timan_service_partner')
        and nullif(btrim(u.dealer_number), '') in (nullif(btrim(d.account_number), ''), nullif(btrim(d.dealer_number), '')))
    )
  )
$$;
