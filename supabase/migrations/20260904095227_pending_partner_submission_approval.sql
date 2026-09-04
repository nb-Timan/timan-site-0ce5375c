-- Keep new collaboration-partner submissions separate from canonical partner
-- master data until an internal reviewer explicitly approves them.

alter table public.portal_form_submissions
  add column if not exists review_status text not null default 'pending',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by_user_id uuid references public.app_users(id) on delete set null,
  add column if not exists review_note text,
  add column if not exists approved_dealer_account_id uuid references public.dealer_accounts(id) on delete set null;

alter table public.portal_form_submissions
  drop constraint if exists portal_form_submissions_review_status_check;

alter table public.portal_form_submissions
  add constraint portal_form_submissions_review_status_check
  check (review_status in ('pending', 'approved', 'returned', 'rejected'));

create index if not exists portal_form_submissions_company_pending_idx
  on public.portal_form_submissions (created_at desc)
  where form_type = 'company_contact_info' and review_status = 'pending';

-- Sellers may create and read only their own fresh onboarding submissions.
-- Existing non-onboarding form policies remain intact.
drop policy if exists "portal_form_submissions insert scoped" on public.portal_form_submissions;

create policy "portal_form_submissions insert company onboarding"
on public.portal_form_submissions
for insert
to authenticated
with check (
  form_type = 'company_contact_info'
  and review_status = 'pending'
  and exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and au.id = submitted_by_user_id
      and coalesce(au.is_active, false)
      and coalesce(au.approved, false)
      and au.portal_role in ('timan_backend', 'timan_seller', 'timan_service')
  )
);

create policy "portal_form_submissions insert other scoped"
on public.portal_form_submissions
for insert
to authenticated
with check (
  form_type <> 'company_contact_info'
  and (
    (dealer_account_number is not null)
    or form_type <> all (array['dealer_invoice_accept'::public.portal_form_type])
  )
  and exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and (au.id = submitted_by_user_id or lower(au.email) = lower(coalesce(submitted_by_email, '')))
      and (
        au.portal_role in ('timan_backend', 'timan_service')
        or au.role = 'timan_backend'
        or (
          (au.portal_role in ('timan_dealer', 'timan_importer', 'timan_service_partner', 'dealer_user') or au.role = 'partner')
          and dealer_account_number is not null
          and dealer_account_number = public.current_user_dealer_number()
        )
      )
  )
);

create policy "portal_form_submissions read seller onboarding own"
on public.portal_form_submissions
for select
to authenticated
using (
  form_type = 'company_contact_info'
  and exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and au.id = submitted_by_user_id
      and coalesce(au.is_active, false)
      and coalesce(au.approved, false)
      and au.portal_role = 'timan_seller'
  )
);

create or replace function public.review_company_contact_info_submission(
  p_submission_id uuid,
  p_decision text,
  p_account_number text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer public.app_users%rowtype;
  v_submitter public.app_users%rowtype;
  v_submission public.portal_form_submissions%rowtype;
  v_patch jsonb;
  v_contacts jsonb;
  v_contact jsonb;
  v_dealer_id uuid;
  v_vat text;
  v_account_number text;
begin
  select * into v_reviewer
  from public.app_users
  where auth_user_id = (select auth.uid())
    and coalesce(is_active, false)
    and coalesce(approved, false)
    and portal_role = 'timan_backend'
  limit 1;

  if v_reviewer.id is null then
    raise exception 'Kun Timan Backend kan gennemgå partneroplysninger.' using errcode = '42501';
  end if;

  select * into v_submission
  from public.portal_form_submissions
  where id = p_submission_id
    and form_type = 'company_contact_info'
  for update;

  if v_submission.id is null then
    raise exception 'Indsendelsen blev ikke fundet.' using errcode = 'P0002';
  end if;
  if v_submission.review_status <> 'pending' then
    raise exception 'Indsendelsen er allerede behandlet.' using errcode = 'P0001';
  end if;
  if p_decision not in ('approved', 'returned', 'rejected') then
    raise exception 'Ugyldig review-beslutning.' using errcode = '22023';
  end if;

  if p_decision <> 'approved' then
    update public.portal_form_submissions
    set review_status = p_decision,
        reviewed_at = now(),
        reviewed_by_user_id = v_reviewer.id,
        review_note = nullif(trim(coalesce(p_note, '')), '')
    where id = v_submission.id;
    return null;
  end if;

  v_patch := coalesce(v_submission.payload -> 'dealer_account_patch', '{}'::jsonb);
  v_contacts := coalesce(v_submission.payload -> 'dealer_contacts', '[]'::jsonb);
  v_vat := nullif(trim(coalesce(v_patch ->> 'vat_number', '')), '');
  v_account_number := nullif(trim(coalesce(p_account_number, '')), '');

  select * into v_submitter
  from public.app_users
  where id = v_submission.submitted_by_user_id
  limit 1;

  select id into v_dealer_id
  from public.dealer_accounts
  where v_vat is not null
    and lower(trim(coalesce(vat_number, ''))) = lower(v_vat)
  limit 1
  for update;

  if v_dealer_id is null then
    if v_account_number is null then
      raise exception 'Et kontonummer er påkrævet, når en ny partner godkendes.' using errcode = '22023';
    end if;
    if exists (select 1 from public.dealer_accounts where account_number = v_account_number) then
      raise exception 'Kontonummeret findes allerede. Vælg den eksisterende partner i stedet.' using errcode = '23505';
    end if;

    insert into public.dealer_accounts (
      account_number, dealer_number, company_name, display_name, customer_type, customer_type_label, dealer_type,
      country, postal_code, city, address, address_line_1, vat_number, invoice_email, payment_terms, currency_code,
      website, social_linkedin, social_facebook, social_instagram, social_tiktok, social_youtube,
      source, status, is_active, is_blocked, is_deleted,
      assigned_seller_id, assigned_seller_name, assigned_seller_email, assigned_seller_initials,
      primary_contact_name, primary_contact_email, primary_contact_phone
    ) values (
      v_account_number, v_account_number, coalesce(nullif(trim(v_patch ->> 'company_name'), ''), v_submission.dealer_name),
      coalesce(nullif(trim(v_patch ->> 'company_name'), ''), v_submission.dealer_name), 'Forhandler', 'Forhandler', 'Forhandler',
      nullif(trim(v_patch ->> 'country'), ''), nullif(trim(v_patch ->> 'postal_code'), ''), nullif(trim(v_patch ->> 'city'), ''),
      nullif(trim(v_patch ->> 'address_line_1'), ''), nullif(trim(v_patch ->> 'address_line_1'), ''), v_vat,
      nullif(trim(v_patch ->> 'invoice_email'), ''), nullif(trim(v_patch ->> 'payment_terms'), ''), nullif(trim(v_patch ->> 'currency_code'), ''),
      nullif(trim(v_patch ->> 'website'), ''), nullif(trim(v_patch ->> 'social_linkedin'), ''), nullif(trim(v_patch ->> 'social_facebook'), ''),
      nullif(trim(v_patch ->> 'social_instagram'), ''), nullif(trim(v_patch ->> 'social_tiktok'), ''), nullif(trim(v_patch ->> 'social_youtube'), ''),
      'onboarding', 'active', true, false, false,
      v_submitter.id, v_submitter.full_name, v_submitter.email, v_submitter.initials,
      null, null, null
    ) returning id into v_dealer_id;
  else
    update public.dealer_accounts
    set company_name = coalesce(nullif(trim(v_patch ->> 'company_name'), ''), company_name),
        display_name = coalesce(nullif(trim(v_patch ->> 'company_name'), ''), display_name),
        country = coalesce(nullif(trim(v_patch ->> 'country'), ''), country),
        postal_code = coalesce(nullif(trim(v_patch ->> 'postal_code'), ''), postal_code),
        city = coalesce(nullif(trim(v_patch ->> 'city'), ''), city),
        address = coalesce(nullif(trim(v_patch ->> 'address_line_1'), ''), address),
        address_line_1 = coalesce(nullif(trim(v_patch ->> 'address_line_1'), ''), address_line_1),
        invoice_email = coalesce(nullif(trim(v_patch ->> 'invoice_email'), ''), invoice_email),
        payment_terms = coalesce(nullif(trim(v_patch ->> 'payment_terms'), ''), payment_terms),
        currency_code = coalesce(nullif(trim(v_patch ->> 'currency_code'), ''), currency_code),
        website = coalesce(nullif(trim(v_patch ->> 'website'), ''), website),
        is_active = true,
        is_blocked = false,
        is_deleted = false,
        status = 'active'
    where id = v_dealer_id;
  end if;

  if exists (select 1 from jsonb_array_elements(v_contacts) c where coalesce((c ->> 'is_primary')::boolean, false)) then
    update public.dealer_contacts set is_primary = false where dealer_account_id = v_dealer_id;
  end if;
  for v_contact in select value from jsonb_array_elements(v_contacts) loop
    if nullif(trim(coalesce(v_contact ->> 'name', '')), '') is not null
       or nullif(trim(coalesce(v_contact ->> 'email', '')), '') is not null then
      insert into public.dealer_contacts (dealer_account_id, contact_area, role_title, name, email, phone, is_primary)
      select v_dealer_id, v_contact ->> 'contact_area', nullif(trim(v_contact ->> 'role_title'), ''),
             nullif(trim(v_contact ->> 'name'), ''), nullif(trim(v_contact ->> 'email'), ''),
             nullif(trim(v_contact ->> 'phone'), ''), coalesce((v_contact ->> 'is_primary')::boolean, false)
      where not exists (
        select 1 from public.dealer_contacts dc
        where dc.dealer_account_id = v_dealer_id
          and dc.contact_area = v_contact ->> 'contact_area'
          and coalesce(lower(dc.email), '') = coalesce(lower(nullif(trim(v_contact ->> 'email'), '')), '')
          and coalesce(lower(dc.name), '') = coalesce(lower(nullif(trim(v_contact ->> 'name'), '')), '')
      );
    end if;
  end loop;

  update public.portal_form_submissions
  set review_status = 'approved',
      reviewed_at = now(),
      reviewed_by_user_id = v_reviewer.id,
      review_note = nullif(trim(coalesce(p_note, '')), ''),
      approved_dealer_account_id = v_dealer_id
  where id = v_submission.id;

  return v_dealer_id;
end;
$$;

revoke all on function public.review_company_contact_info_submission(uuid, text, text, text) from public, anon;
grant execute on function public.review_company_contact_info_submission(uuid, text, text, text) to authenticated;
