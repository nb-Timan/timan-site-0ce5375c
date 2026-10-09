alter table public.crm_demo_leads
  add column if not exists dealer_account_id uuid references public.dealer_accounts(id) on delete set null,
  add column if not exists dealer_rep_contact_id uuid references public.dealer_contacts(id) on delete set null,
  add column if not exists dealer_rep_user_id uuid references public.app_users(id) on delete set null;

alter table public.crm_demo_leads
  drop constraint if exists crm_demo_leads_single_dealer_rep_reference;

alter table public.crm_demo_leads
  add constraint crm_demo_leads_single_dealer_rep_reference
  check (num_nonnulls(dealer_rep_contact_id, dealer_rep_user_id) <= 1);

create index if not exists crm_demo_leads_dealer_account_id_idx
  on public.crm_demo_leads (dealer_account_id);

create index if not exists crm_demo_leads_dealer_rep_contact_id_idx
  on public.crm_demo_leads (dealer_rep_contact_id)
  where dealer_rep_contact_id is not null;

create index if not exists crm_demo_leads_dealer_rep_user_id_idx
  on public.crm_demo_leads (dealer_rep_user_id)
  where dealer_rep_user_id is not null;

create or replace function public.create_crm_demo_lifecycle_with_representative(
  p_source_lead_id uuid,
  p_demo jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
  v_lead_id uuid;
  v_demo_id uuid;
  v_linked_dealer_id uuid;
  v_payload_dealer_id uuid := nullif(p_demo ->> 'dealer_account_id', '')::uuid;
  v_contact_id uuid := nullif(p_demo ->> 'dealer_rep_contact_id', '')::uuid;
  v_user_id uuid := nullif(p_demo ->> 'dealer_rep_user_id', '')::uuid;
  v_snapshot text;
begin
  if num_nonnulls(v_contact_id, v_user_id) > 1 then
    raise exception using errcode = '22023', message = 'DEALER_REP_REFERENCE_CONFLICT';
  end if;

  v_result := public.create_crm_demo_lifecycle(p_source_lead_id, p_demo);
  v_lead_id := nullif(v_result ->> 'lead_id', '')::uuid;
  v_demo_id := nullif(v_result ->> 'demo_id', '')::uuid;

  select linked_dealer_id
    into v_linked_dealer_id
  from public.crm_leads
  where id = v_lead_id;

  v_linked_dealer_id := coalesce(v_linked_dealer_id, v_payload_dealer_id);

  if v_payload_dealer_id is not null
     and v_linked_dealer_id is distinct from v_payload_dealer_id then
    raise exception using errcode = '42501', message = 'DEALER_REP_DEALER_MISMATCH';
  end if;

  if v_contact_id is not null then
    select coalesce(nullif(btrim(dc.name), ''), nullif(btrim(dc.email), ''))
      into v_snapshot
    from public.dealer_contacts dc
    where dc.id = v_contact_id
      and dc.dealer_account_id = v_linked_dealer_id;

    if not found then
      raise exception using errcode = '42501', message = 'DEALER_REP_OUTSIDE_DEALER';
    end if;
  elsif v_user_id is not null then
    select coalesce(
             nullif(btrim(au.display_name), ''),
             nullif(btrim(au.full_name), ''),
             nullif(btrim(au.email), '')
           )
      into v_snapshot
    from public.app_users au
    join public.dealer_accounts da
      on da.account_number = au.dealer_number
    where au.id = v_user_id
      and da.id = v_linked_dealer_id
      and au.approved is true
      and au.is_active is true;

    if not found then
      raise exception using errcode = '42501', message = 'DEALER_REP_OUTSIDE_DEALER';
    end if;
  end if;

  update public.crm_demo_leads
  set dealer_account_id = v_linked_dealer_id,
      dealer_rep_contact_id = v_contact_id,
      dealer_rep_user_id = v_user_id,
      dealer_rep = coalesce(v_snapshot, dealer_rep)
  where id = v_demo_id
    and source_lead_id = v_lead_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'DEMO_LIFECYCLE_RESULT_NOT_FOUND';
  end if;

  return v_result;
end;
$$;

revoke all on function public.create_crm_demo_lifecycle_with_representative(uuid, jsonb)
  from public, anon;
grant execute on function public.create_crm_demo_lifecycle_with_representative(uuid, jsonb)
  to authenticated;

comment on function public.create_crm_demo_lifecycle_with_representative(uuid, jsonb) is
  'Creates a canonical CRM demo lifecycle and validates an optional dealer contact/app-user reference against the linked dealer. Keeps dealer_rep as the historical name snapshot.';
