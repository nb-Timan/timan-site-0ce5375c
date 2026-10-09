-- The Messe form creates a CRM lead on behalf of the selected internal
-- seller.  Its authenticated exhibition user is deliberately not a general
-- CRM writer, so allow only this narrow, validated insert shape.

drop policy if exists crm_leads_insert_messe_scoped on public.crm_leads;
create policy crm_leads_insert_messe_scoped
  on public.crm_leads
  for insert
  to authenticated
  with check (
    lower(trim(coalesce(trade_fair, ''))) in ('messe / exhibition', 'messe / udstilling')
    and exists (
      select 1
      from public.app_users actor
      where actor.auth_user_id = (select auth.uid())
        and actor.is_active = true
        and actor.approved = true
        and lower(actor.status) in ('active', 'approved')
        and (
          lower(coalesce(actor.portal_variant, '')) = 'messe'
          or actor.portal_role::text = 'exhibition_user'
        )
    )
    and exists (
      select 1
      from public.app_users seller
      where seller.id = crm_leads.owner_user_id
        and seller.is_active = true
        and seller.approved = true
        and lower(seller.status) in ('active', 'approved')
        and seller.portal_role::text in ('timan_seller', 'timan_backend')
        and (
          crm_leads.owner_email is null
          or lower(trim(crm_leads.owner_email)) = lower(trim(coalesce(seller.email, '')))
        )
    )
    and (
      crm_leads.linked_dealer_id is null
      or exists (
        select 1
        from public.dealer_accounts dealer
        where dealer.id = crm_leads.linked_dealer_id
          and dealer.assigned_seller_id = crm_leads.owner_user_id
          and coalesce(dealer.is_active, true) = true
          and coalesce(dealer.is_deleted, false) = false
          and coalesce(dealer.is_blocked, false) = false
      )
    )
  );
