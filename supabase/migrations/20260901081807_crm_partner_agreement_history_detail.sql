-- CRM partner detail: expose append-only agreement history on the CRM
-- dealer detail page without creating a parallel activity model.

alter table public.partner_agreement_history
  add column if not exists occurred_at timestamptz;

update public.partner_agreement_history
set occurred_at = coalesce(occurred_at, created_at, now())
where occurred_at is null;

alter table public.partner_agreement_history
  alter column occurred_at set default now(),
  alter column occurred_at set not null;

alter table public.partner_agreement_history
  drop constraint if exists partner_agreement_history_event_type_check;

alter table public.partner_agreement_history
  add constraint partner_agreement_history_event_type_check check (
    event_type in (
      'partner_info_received',
      'partner_approved',
      'contract_access_activated',
      'contract_access_revoked',
      'contract_review_completed',
      'contract_received',
      'contract_approved',
      'new_agreement',
      'collaboration_partner_added',
      'partner_relation_changed',
      'service_partner_added',
      'dealer_customer_added',
      'cooperation_ended'
    )
  );

create index if not exists partner_agreement_history_dealer_occurred_idx
  on public.partner_agreement_history (dealer_account_id, occurred_at desc);

create or replace function public.append_partner_agreement_history(
  p_dealer_account_id uuid,
  p_event_type text,
  p_event_title text,
  p_event_description text default null,
  p_contract_id uuid default null,
  p_upload_version_id uuid default null,
  p_partner_relation_id uuid default null,
  p_document_bucket text default null,
  p_document_path text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default null
)
returns public.partner_agreement_history
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  dealer public.dealer_accounts;
  result public.partner_agreement_history;
begin
  select * into actor from public.current_timan_app_user();
  select * into dealer from public.dealer_accounts where id = p_dealer_account_id;
  if dealer.id is null and p_contract_id is not null then
    select da.* into dealer
    from public.dealer_contracts dc
    join public.dealer_accounts da
      on da.id = dc.dealer_account_id
      or da.account_number = dc.dealer_account_number
    where dc.id = p_contract_id
    limit 1;
  end if;
  if dealer.id is null then
    raise exception 'dealer account not found';
  end if;

  insert into public.partner_agreement_history (
    dealer_account_id,
    dealer_account_number,
    event_type,
    event_title,
    event_description,
    contract_id,
    upload_version_id,
    partner_relation_id,
    document_bucket,
    document_path,
    metadata,
    created_by_user_id,
    created_by_name,
    created_by_email,
    occurred_at
  )
  values (
    dealer.id,
    dealer.account_number,
    p_event_type,
    p_event_title,
    p_event_description,
    p_contract_id,
    p_upload_version_id,
    p_partner_relation_id,
    p_document_bucket,
    p_document_path,
    coalesce(p_metadata, '{}'::jsonb),
    auth.uid(),
    actor.display_name,
    actor.email,
    coalesce(p_occurred_at, now())
  )
  returning * into result;

  return result;
end;
$$;

revoke all on function public.append_partner_agreement_history(uuid, text, text, text, uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.append_partner_agreement_history(uuid, text, text, text, uuid, uuid, uuid, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.append_partner_agreement_history(uuid, text, text, text, uuid, uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.append_partner_agreement_history(uuid, text, text, text, uuid, uuid, uuid, text, text, jsonb, timestamptz) to service_role;

create or replace function public.create_partner_agreement_history_event(
  p_dealer_account_id uuid,
  p_event_type text,
  p_event_title text,
  p_event_description text default null,
  p_occurred_at timestamptz default null,
  p_contract_id uuid default null,
  p_upload_version_id uuid default null,
  p_partner_relation_id uuid default null,
  p_document_bucket text default null,
  p_document_path text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.partner_agreement_history
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_dealer_contract_access(p_dealer_account_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return public.append_partner_agreement_history(
    p_dealer_account_id,
    p_event_type,
    p_event_title,
    p_event_description,
    p_contract_id,
    p_upload_version_id,
    p_partner_relation_id,
    p_document_bucket,
    p_document_path,
    coalesce(p_metadata, '{}'::jsonb),
    p_occurred_at
  );
end;
$$;

revoke all on function public.create_partner_agreement_history_event(uuid, text, text, text, timestamptz, uuid, uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.create_partner_agreement_history_event(uuid, text, text, text, timestamptz, uuid, uuid, uuid, text, text, jsonb) to authenticated, service_role;
