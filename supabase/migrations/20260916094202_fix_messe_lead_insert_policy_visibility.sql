-- The Messe actor can create a tightly scoped CRM lead but must not receive
-- general visibility into internal sellers or dealer accounts.  RLS policy
-- subqueries run as the caller, so resolve those two canonical relations in
-- this non-API helper instead.

create schema if not exists private;

create or replace function private.can_messe_actor_assign_crm_lead(
  p_owner_user_id uuid,
  p_owner_email text,
  p_linked_dealer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
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
      where seller.id = p_owner_user_id
        and seller.is_active = true
        and seller.approved = true
        and lower(seller.status) in ('active', 'approved')
        and seller.portal_role::text in ('timan_seller', 'timan_backend')
        and (
          p_owner_email is null
          or lower(trim(p_owner_email)) = lower(trim(coalesce(seller.email, '')))
        )
    )
    and (
      p_linked_dealer_id is null
      or exists (
        select 1
        from public.dealer_accounts dealer
        where dealer.id = p_linked_dealer_id
          and dealer.assigned_seller_id = p_owner_user_id
          and coalesce(dealer.is_active, true) = true
          and coalesce(dealer.is_deleted, false) = false
          and coalesce(dealer.is_blocked, false) = false
      )
    );
$$;

revoke all on function private.can_messe_actor_assign_crm_lead(uuid, text, uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.can_messe_actor_assign_crm_lead(uuid, text, uuid) to authenticated;

drop policy if exists crm_leads_insert_messe_scoped on public.crm_leads;
create policy crm_leads_insert_messe_scoped
  on public.crm_leads
  for insert
  to authenticated
  with check (
    lower(trim(coalesce(trade_fair, ''))) in ('messe / exhibition', 'messe / udstilling')
    and private.can_messe_actor_assign_crm_lead(
      crm_leads.owner_user_id,
      crm_leads.owner_email,
      crm_leads.linked_dealer_id
    )
  );
