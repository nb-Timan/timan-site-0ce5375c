-- Foundation table for extra dealer profile contacts.
--
-- The portal UI already stores the first contact for each area directly on
-- dealer_accounts, and expects extra people in dealer_contacts.

create table if not exists public.dealer_contacts (
  id uuid primary key default gen_random_uuid(),
  dealer_account_id uuid not null references public.dealer_accounts(id) on delete cascade,
  contact_area text not null,
  role_title text,
  name text,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_contacts_contact_area_check
    check (contact_area in ('director','sales','workshop','parts','marketing','finance'))
);

create index if not exists dealer_contacts_dealer_account_id_idx
  on public.dealer_contacts(dealer_account_id);

create index if not exists dealer_contacts_area_idx
  on public.dealer_contacts(dealer_account_id, contact_area);

create or replace function public.touch_dealer_contacts_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dealer_contacts_touch_updated_at on public.dealer_contacts;
create trigger dealer_contacts_touch_updated_at
before update on public.dealer_contacts
for each row
execute function public.touch_dealer_contacts_updated_at();

alter table public.dealer_contacts enable row level security;

drop policy if exists dealer_contacts_select_scope on public.dealer_contacts;
create policy dealer_contacts_select_scope
on public.dealer_contacts
for select
to authenticated
using (
  public.is_timan_backend()
  or exists (
    select 1
    from public.dealer_accounts da
    where da.id = dealer_contacts.dealer_account_id
      and da.account_number is not null
      and da.account_number = public.current_user_dealer_number()
  )
);

drop policy if exists dealer_contacts_insert_scope on public.dealer_contacts;
create policy dealer_contacts_insert_scope
on public.dealer_contacts
for insert
to authenticated
with check (
  public.is_timan_backend()
  or exists (
    select 1
    from public.dealer_accounts da
    where da.id = dealer_contacts.dealer_account_id
      and da.account_number is not null
      and da.account_number = public.current_user_dealer_number()
  )
);

drop policy if exists dealer_contacts_update_scope on public.dealer_contacts;
create policy dealer_contacts_update_scope
on public.dealer_contacts
for update
to authenticated
using (
  public.is_timan_backend()
  or exists (
    select 1
    from public.dealer_accounts da
    where da.id = dealer_contacts.dealer_account_id
      and da.account_number is not null
      and da.account_number = public.current_user_dealer_number()
  )
)
with check (
  public.is_timan_backend()
  or exists (
    select 1
    from public.dealer_accounts da
    where da.id = dealer_contacts.dealer_account_id
      and da.account_number is not null
      and da.account_number = public.current_user_dealer_number()
  )
);

drop policy if exists dealer_contacts_delete_scope on public.dealer_contacts;
create policy dealer_contacts_delete_scope
on public.dealer_contacts
for delete
to authenticated
using (
  public.is_timan_backend()
  or exists (
    select 1
    from public.dealer_accounts da
    where da.id = dealer_contacts.dealer_account_id
      and da.account_number is not null
      and da.account_number = public.current_user_dealer_number()
  )
);

grant select, insert, update, delete on public.dealer_contacts to authenticated;
grant execute on function public.touch_dealer_contacts_updated_at() to authenticated;
