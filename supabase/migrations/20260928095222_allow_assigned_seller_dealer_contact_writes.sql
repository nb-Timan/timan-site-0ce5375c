-- Timan sellers can maintain contacts only for dealer accounts assigned to
-- their canonical app_users.id. Backend and external dealer access remains
-- exactly as before; seller delete access is intentionally not introduced.
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
  or exists (
    select 1
    from public.dealer_accounts da
    cross join public.current_timan_app_user() actor
    where da.id = dealer_contacts.dealer_account_id
      and actor.portal_role = 'timan_seller'
      and da.assigned_seller_id = actor.id
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
  or exists (
    select 1
    from public.dealer_accounts da
    cross join public.current_timan_app_user() actor
    where da.id = dealer_contacts.dealer_account_id
      and actor.portal_role = 'timan_seller'
      and da.assigned_seller_id = actor.id
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
  or exists (
    select 1
    from public.dealer_accounts da
    cross join public.current_timan_app_user() actor
    where da.id = dealer_contacts.dealer_account_id
      and actor.portal_role = 'timan_seller'
      and da.assigned_seller_id = actor.id
  )
);
