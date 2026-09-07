-- A Timan seller must be able to read canonical contacts for the partner
-- accounts assigned to that seller. Completion in CRM uses those contacts,
-- just like the Partnerdata detail page does.
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
      and (
        da.account_number = public.current_user_dealer_number()
        or public.can_manage_partner_admin_fields(
          da.assigned_seller_id,
          da.assigned_seller_email,
          da.assigned_seller_initials
        )
      )
  )
);
