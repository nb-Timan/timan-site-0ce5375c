-- Canonical dealer warranty flow:
--
-- Dealer input is a pending submission, not a warranty registration.  The
-- existing warranty_registrations table is also the machine registry, so
-- putting a second pending row there would create a duplicate physical
-- machine and make the read-model treat it as an approved SP warranty.
--
-- The submission table is deliberately a small child of the canonical
-- warranty model. Approval creates or upgrades exactly one canonical
-- warranty_registrations row and records the full audit trail.

create table if not exists public.warranty_submissions (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'portal_manual'
    check (source = 'portal_manual'),
  submission_status text not null default 'pending'
    check (submission_status in ('pending', 'approved', 'rejected', 'cancelled')),

  machine_serial_number text not null,
  machine_serial_raw text not null,
  normalized_serial text generated always as (
    upper(regexp_replace(machine_serial_number, '[^A-Za-z0-9]+', '', 'g'))
  ) stored,
  machine_model text not null,
  tool_serials text[] not null default '{}'::text[],
  is_demo boolean not null default false,
  replacement_brand text,

  dealer_account_id uuid not null references public.dealer_accounts(id) on delete restrict,
  dealer_account_number text not null,
  dealer_name_snapshot text not null,
  submitted_by_user_id uuid references public.app_users(id) on delete set null,
  submitted_by_email text,

  customer_name text not null,
  customer_address text,
  customer_postal_code text,
  customer_city text,
  customer_country text,
  customer_phone text,
  customer_email text,
  delivery_date date not null,
  language text,
  comment text,

  matched_machine_registration_id uuid references public.warranty_registrations(id) on delete set null,
  approved_registration_id uuid references public.warranty_registrations(id) on delete restrict,
  approved_by_user_id uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint warranty_submissions_approved_requires_registration check (
    submission_status <> 'approved'
    or (approved_registration_id is not null and approved_at is not null)
  )
);

comment on table public.warranty_submissions is
  'Dealer warranty input awaiting internal review. Approved entries are materialized only in warranty_registrations.';

create index if not exists warranty_submissions_status_created_idx
  on public.warranty_submissions (submission_status, created_at desc);
create index if not exists warranty_submissions_dealer_status_idx
  on public.warranty_submissions (dealer_account_id, submission_status, created_at desc);
create index if not exists warranty_submissions_normalized_serial_idx
  on public.warranty_submissions (normalized_serial);
create unique index if not exists warranty_submissions_one_pending_serial_per_dealer
  on public.warranty_submissions (dealer_account_id, normalized_serial)
  where submission_status = 'pending';

create or replace function public.set_updated_at_warranty_submissions()
returns trigger
language plpgsql
set search_path = public
as $warranty_submission_touch$
begin
  new.updated_at := now();
  return new;
end;
$warranty_submission_touch$;

drop trigger if exists trg_warranty_submissions_updated_at on public.warranty_submissions;
create trigger trg_warranty_submissions_updated_at
  before update on public.warranty_submissions
  for each row execute function public.set_updated_at_warranty_submissions();

-- The current register has no canonical SP sequence. Start after the highest
-- existing numeric SP ID and use the same sequence for every new portal approval.
create sequence if not exists public.warranty_sp_number_seq;
select setval(
  'public.warranty_sp_number_seq',
  greatest(
    coalesce((
      select max((regexp_match(certificate_number, '^SP-([0-9]+)$'))[1]::bigint)
      from public.warranty_registrations
      where certificate_number ~ '^SP-[0-9]+$'
    ), 0),
    1
  ),
  true
);

create unique index if not exists warranty_registrations_numeric_sp_unique
  on public.warranty_registrations (upper(certificate_number))
  where certificate_number ~ '^SP-[0-9]+$';

alter table public.warranty_submissions enable row level security;

drop policy if exists warranty_submissions_internal_select on public.warranty_submissions;
create policy warranty_submissions_internal_select
  on public.warranty_submissions
  for select
  to authenticated
  using (public.is_timan_global_warranty());

drop policy if exists warranty_submissions_scoped_select on public.warranty_submissions;
create policy warranty_submissions_scoped_select
  on public.warranty_submissions
  for select
  to authenticated
  using (dealer_account_id in (select public.warranty_visible_dealer_ids()));

grant select on public.warranty_submissions to authenticated;
grant all on public.warranty_submissions to service_role;

-- Drop/recreate is required because the prior RPC returned a warranty row.
-- A submission now intentionally returns the pending submission row instead.
drop function if exists public.create_scoped_portal_warranty_registration(jsonb);

create function public.create_scoped_portal_warranty_registration(
  p_registration jsonb
)
returns public.warranty_submissions
language plpgsql
security definer
set search_path = public
as $dealer_warranty_submit$
declare
  v_user public.app_users%rowtype;
  v_dealer public.dealer_accounts%rowtype;
  v_submission public.warranty_submissions%rowtype;
  v_machine_serial text := nullif(btrim(coalesce(p_registration ->> 'machine_serial_number', '')), '');
  v_normalized_serial text;
  v_delivery_date date;
  v_machine_registration_id uuid;
  v_actor record;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select au.* into v_user
  from public.app_users au
  where coalesce(au.is_active, false)
    and coalesce(au.approved, false)
    and (au.auth_user_id = auth.uid()
      or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', ''))))
  order by case when au.auth_user_id = auth.uid() then 0 else 1 end
  limit 1;

  if not found or v_user.portal_role <> 'timan_dealer'::public.portal_role then
    raise exception 'Only active dealer accounts may submit portal warranty registrations'
      using errcode = '42501';
  end if;

  select da.* into v_dealer
  from public.dealer_accounts da
  where lower(trim(da.account_number)) = lower(trim(coalesce(v_user.dealer_number, '')))
    and coalesce(da.is_active, true)
    and not coalesce(da.is_deleted, false)
    and not coalesce(da.is_blocked, false)
  limit 1;

  if not found then
    raise exception 'The authenticated dealer does not have an active canonical account'
      using errcode = '42501';
  end if;

  if v_machine_serial is null
     or nullif(btrim(coalesce(p_registration ->> 'machine_model', '')), '') is null
     or nullif(btrim(coalesce(p_registration ->> 'customer_name', '')), '') is null then
    raise exception 'Machine serial, machine model and customer name are required'
      using errcode = '22023';
  end if;

  begin
    v_delivery_date := nullif(btrim(coalesce(p_registration ->> 'delivery_date', '')), '')::date;
  exception when invalid_text_representation then
    raise exception 'Delivery date is invalid' using errcode = '22023';
  end;
  if v_delivery_date is null then
    raise exception 'Delivery date is required' using errcode = '22023';
  end if;

  v_normalized_serial := upper(regexp_replace(v_machine_serial, '[^A-Za-z0-9]+', '', 'g'));
  if v_normalized_serial = '' then
    raise exception 'Machine serial is invalid' using errcode = '22023';
  end if;

  select wr.id into v_machine_registration_id
  from public.warranty_registrations wr
  where wr.is_active_in_source
    and upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) = v_normalized_serial
  order by (wr.source = 'legacy_machine_import') desc, wr.created_at desc
  limit 1;

  insert into public.warranty_submissions (
    machine_serial_number, machine_serial_raw, machine_model, tool_serials,
    is_demo, replacement_brand,
    dealer_account_id, dealer_account_number, dealer_name_snapshot,
    submitted_by_user_id, submitted_by_email,
    customer_name, customer_address, customer_postal_code, customer_city,
    customer_country, customer_phone, customer_email, delivery_date, language,
    comment, matched_machine_registration_id
  ) values (
    upper(regexp_replace(v_machine_serial, '\\s+', '', 'g')), v_machine_serial,
    nullif(btrim(coalesce(p_registration ->> 'machine_model', '')), ''),
    coalesce(array(select nullif(btrim(value), '')
      from jsonb_array_elements_text(coalesce(p_registration -> 'tool_serials', '[]'::jsonb)) value
      where nullif(btrim(value), '') is not null), '{}'::text[]),
    coalesce((p_registration ->> 'is_demo')::boolean, false),
    nullif(btrim(coalesce(p_registration ->> 'replacement_brand', '')), ''),
    v_dealer.id, v_dealer.account_number, v_dealer.company_name,
    v_user.id, v_user.email,
    nullif(btrim(coalesce(p_registration ->> 'customer_name', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_address', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_postal_code', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_city', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_country', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_phone', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_email', '')), ''),
    v_delivery_date, nullif(btrim(coalesce(p_registration ->> 'language', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'comment', '')), ''),
    v_machine_registration_id
  ) returning * into v_submission;

  select * into v_actor from public.audit_current_actor();
  insert into public.audit_log (
    actor_user_id, actor_email, actor_name, actor_role,
    action, module, record_type, record_id, record_label, new_value, changed_fields, status
  ) values (
    v_actor.actor_user_id, v_actor.actor_email, v_actor.actor_name, v_actor.actor_role,
    'submit', 'warranty', 'warranty_submission', v_submission.id::text,
    v_submission.machine_serial_number,
    jsonb_build_object('submission_status', 'pending', 'dealer_account_number', v_dealer.account_number,
      'matched_machine_registration_id', v_machine_registration_id),
    array['submission_status', 'machine_serial_number', 'dealer_account_id'], 'success'
  );

  return v_submission;
end;
$dealer_warranty_submit$;

revoke all on function public.create_scoped_portal_warranty_registration(jsonb) from public;
revoke execute on function public.create_scoped_portal_warranty_registration(jsonb) from anon;
grant execute on function public.create_scoped_portal_warranty_registration(jsonb) to authenticated;

create or replace function public.approve_pending_portal_warranty_submission(
  p_submission_id uuid
)
returns public.warranty_registrations
language plpgsql
security definer
set search_path = public
as $dealer_warranty_approve$
declare
  v_submission public.warranty_submissions%rowtype;
  v_before public.warranty_registrations%rowtype;
  v_registration public.warranty_registrations%rowtype;
  v_actor record;
  v_sp_number text;
begin
  if not public.is_timan_global_warranty() then
    raise exception 'Not authorised to approve warranty submissions' using errcode = '42501';
  end if;

  select * into v_submission
  from public.warranty_submissions
  where id = p_submission_id
  for update;
  if not found then
    raise exception 'Warranty submission not found' using errcode = 'P0002';
  end if;
  if v_submission.submission_status <> 'pending' then
    raise exception 'Warranty submission is not pending review' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.warranty_registrations wr
    where wr.is_active_in_source
      and wr.certificate_number ~ '^SP-[0-9]+$'
      and upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) = v_submission.normalized_serial
  ) then
    raise exception 'This serial already has an approved SP warranty' using errcode = '23505';
  end if;

  -- Serialise number allocation and move the sequence forward when an
  -- imported SharePoint SP number is higher than the local sequence.
  perform pg_advisory_xact_lock(hashtext('public.warranty_sp_number_seq'));
  perform setval(
    'public.warranty_sp_number_seq',
    greatest(
      (select last_value from public.warranty_sp_number_seq),
      coalesce((
        select max((regexp_match(certificate_number, '^SP-([0-9]+)$'))[1]::bigint)
        from public.warranty_registrations
        where certificate_number ~ '^SP-[0-9]+$'
      ), 0)
    ),
    true
  );
  v_sp_number := 'SP-' || nextval('public.warranty_sp_number_seq')::text;

  select * into v_before
  from public.warranty_registrations wr
  where wr.is_active_in_source
    and upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) = v_submission.normalized_serial
  order by (wr.source = 'legacy_machine_import') desc, wr.created_at desc
  limit 1
  for update;

  if found then
    -- This is the existing canonical machine. Its MO reference is deliberately
    -- not touched: approval adds SP to the same physical machine.
    update public.warranty_registrations
       set source = 'portal_manual',
           sharepoint_item_id = 'portal_approval:' || v_submission.id::text,
           sharepoint_form_id = null,
           certificate_number = v_sp_number,
           machine_serial_number = v_submission.machine_serial_number,
           machine_serial_raw = v_submission.machine_serial_raw,
           machine_model = v_submission.machine_model,
           tool_serials = v_submission.tool_serials,
           dealer_name_snapshot = v_submission.dealer_name_snapshot,
           dealer_account_id = v_submission.dealer_account_id,
           dealer_account_number = v_submission.dealer_account_number,
           dealer_match_status = 'matched',
           dealer_match_confidence = 1,
           dealer_match_method = 'approved_dealer_submission',
           customer_name = v_submission.customer_name,
           customer_address = v_submission.customer_address,
           customer_postal_code = v_submission.customer_postal_code,
           customer_city = v_submission.customer_city,
           customer_country = v_submission.customer_country,
           customer_phone = v_submission.customer_phone,
           customer_email = v_submission.customer_email,
           delivery_date = v_submission.delivery_date,
           registration_date = now(),
           language = v_submission.language,
           is_demo = v_submission.is_demo,
           replacement_brand = v_submission.replacement_brand,
           comment = v_submission.comment,
           is_active_in_source = true
     where id = v_before.id
     returning * into v_registration;
  else
    insert into public.warranty_registrations (
      sharepoint_item_id, source, certificate_number,
      machine_serial_number, machine_serial_raw, machine_model, tool_serials,
      dealer_name_snapshot, dealer_account_id, dealer_account_number,
      dealer_match_status, dealer_match_confidence, dealer_match_method,
      customer_name, customer_address, customer_postal_code, customer_city,
      customer_country, customer_phone, customer_email, delivery_date,
      registration_date, language, is_demo, replacement_brand, comment,
      is_active_in_source
    ) values (
      'portal_approval:' || v_submission.id::text, 'portal_manual', v_sp_number,
      v_submission.machine_serial_number, v_submission.machine_serial_raw,
      v_submission.machine_model, v_submission.tool_serials,
      v_submission.dealer_name_snapshot, v_submission.dealer_account_id,
      v_submission.dealer_account_number, 'matched', 1,
      'approved_dealer_submission',
      v_submission.customer_name, v_submission.customer_address,
      v_submission.customer_postal_code, v_submission.customer_city,
      v_submission.customer_country, v_submission.customer_phone,
      v_submission.customer_email, v_submission.delivery_date, now(),
      v_submission.language, v_submission.is_demo, v_submission.replacement_brand,
      v_submission.comment, true
    ) returning * into v_registration;
  end if;

  update public.warranty_submissions
     set submission_status = 'approved',
         approved_registration_id = v_registration.id,
         approved_by_user_id = (select id from public.app_users where auth_user_id = auth.uid() limit 1),
         approved_at = now(),
         rejection_reason = null
   where id = v_submission.id;

  insert into public.warranty_registration_history (registration_id, change_source, snapshot, diff)
  values (
    v_registration.id,
    'portal_dealer_submission_approval',
    coalesce(to_jsonb(v_before), '{}'::jsonb) || jsonb_build_object('_submission_id', v_submission.id, '_actor', auth.uid()),
    jsonb_build_object(
      'event', 'Dealer warranty submission approved: ' || v_sp_number,
      'submission_id', v_submission.id,
      'source', jsonb_build_object('old', v_before.source, 'new', v_registration.source),
      'certificate_number', jsonb_build_object('old', v_before.certificate_number, 'new', v_sp_number),
      'machine_order_reference', v_registration.legacy_warranty_reference,
      '_actor', auth.uid()
    )
  );

  select * into v_actor from public.audit_current_actor();
  insert into public.audit_log (
    actor_user_id, actor_email, actor_name, actor_role,
    action, module, record_type, record_id, record_label, old_value, new_value,
    changed_fields, status
  ) values (
    v_actor.actor_user_id, v_actor.actor_email, v_actor.actor_name, v_actor.actor_role,
    'approve', 'warranty', 'warranty_submission', v_submission.id::text,
    v_sp_number,
    jsonb_build_object('submission_status', 'pending'),
    jsonb_build_object('submission_status', 'approved', 'registration_id', v_registration.id,
      'certificate_number', v_sp_number, 'machine_order_reference', v_registration.legacy_warranty_reference),
    array['submission_status', 'approved_registration_id', 'certificate_number'], 'success'
  );

  return v_registration;
end;
$dealer_warranty_approve$;

revoke all on function public.approve_pending_portal_warranty_submission(uuid) from public;
revoke execute on function public.approve_pending_portal_warranty_submission(uuid) from anon;
grant execute on function public.approve_pending_portal_warranty_submission(uuid) to authenticated;
