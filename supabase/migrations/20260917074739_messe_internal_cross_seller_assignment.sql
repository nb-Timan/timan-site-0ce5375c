-- A Messe submission may be created by any active actor that can access the
-- Messe flow. The selected internal seller remains the only CRM owner; the
-- authenticated actor remains the immutable creator stamped by the existing
-- crm_leads trigger.

create schema if not exists private;

create or replace function private.is_messe_lead_submission_actor()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.app_users actor
    where actor.auth_user_id = (select auth.uid())
      and actor.is_active = true
      and actor.approved = true
      and lower(actor.status) in ('active', 'approved')
      and (
        lower(coalesce(actor.portal_variant, '')) = 'messe'
        or actor.portal_role::text = 'exhibition_user'
        or actor.portal_role::text in ('timan_backend', 'timan_seller', 'timan_service')
        or 'messe_portal' = any(actor.allowed_modules)
        or 'messe_portal' = any(actor.module_access)
      )
  );
$$;

revoke all on function private.is_messe_lead_submission_actor() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_messe_lead_submission_actor() to authenticated;

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
    private.is_messe_lead_submission_actor()
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
          and private.messe_partner_type_for_account(dealer.id) in (
            'dealer', 'service_partner', 'importer', 'supplier'
          )
      )
    );
$$;

revoke all on function private.can_messe_actor_assign_crm_lead(uuid, text, uuid) from public, anon;
grant execute on function private.can_messe_actor_assign_crm_lead(uuid, text, uuid) to authenticated;

drop policy if exists crm_leads_insert_messe_scoped on public.crm_leads;
create policy crm_leads_insert_messe_scoped
  on public.crm_leads
  for insert
  to authenticated
  with check (
    lower(trim(coalesce(trade_fair, ''))) in ('messe / exhibition', 'messe / udstilling')
    and (select private.can_messe_actor_assign_crm_lead(
      crm_leads.owner_user_id,
      crm_leads.owner_email,
      crm_leads.linked_dealer_id
    ))
  );

drop policy if exists crm_leads_select_messe_created on public.crm_leads;
create policy crm_leads_select_messe_created
  on public.crm_leads
  for select
  to authenticated
  using (
    lower(trim(coalesce(crm_leads.trade_fair, ''))) in ('messe / exhibition', 'messe / udstilling')
    and (select private.is_messe_lead_submission_actor())
    and exists (
      select 1
      from public.app_users actor
      where actor.id = crm_leads.created_by_user_id
        and actor.auth_user_id = (select auth.uid())
        and actor.is_active = true
        and actor.approved = true
        and lower(actor.status) in ('active', 'approved')
    )
  );
