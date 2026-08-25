-- Separate register for people/companies that have tried Timan 2620.
-- This is deliberately not a CRM lead table and has no L-number sequence.

create table if not exists public.crm_2620_trials (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  country text,
  company_cvr text not null,
  contact_person text not null,
  address text,
  zip_city text not null,
  phone text not null,
  email text not null,
  comment text,
  responsible_seller_id uuid,
  responsible_seller_name text,
  responsible_seller_email text,
  created_by_email text,
  constraint crm_2620_trials_company_cvr_required check (length(trim(company_cvr)) > 0),
  constraint crm_2620_trials_contact_person_required check (length(trim(contact_person)) > 0),
  constraint crm_2620_trials_zip_city_required check (length(trim(zip_city)) > 0),
  constraint crm_2620_trials_phone_required check (length(trim(phone)) > 0),
  constraint crm_2620_trials_email_required check (length(trim(email)) > 0)
);

create index if not exists crm_2620_trials_created_at_idx
  on public.crm_2620_trials (created_at desc);

create index if not exists crm_2620_trials_responsible_seller_email_idx
  on public.crm_2620_trials (lower(responsible_seller_email))
  where responsible_seller_email is not null;

alter table public.crm_2620_trials enable row level security;

grant select, insert on public.crm_2620_trials to authenticated;

create or replace function public.crm_2620_trials_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop policy if exists "crm_2620_trials_authenticated_select" on public.crm_2620_trials;
create policy "crm_2620_trials_authenticated_select"
  on public.crm_2620_trials
  for select
  to authenticated
  using (true);

drop policy if exists "crm_2620_trials_authenticated_insert" on public.crm_2620_trials;
create policy "crm_2620_trials_authenticated_insert"
  on public.crm_2620_trials
  for insert
  to authenticated
  with check (true);

drop trigger if exists crm_2620_trials_touch_updated_at on public.crm_2620_trials;
create trigger crm_2620_trials_touch_updated_at
  before update on public.crm_2620_trials
  for each row
  execute function public.crm_2620_trials_touch_updated_at();
