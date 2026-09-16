-- createLead returns the authoritative lead number with INSERT ... RETURNING.
-- The Messe actor needs to read only the rows it created itself; it must not
-- gain general CRM visibility merely because it can submit a Messe lead.

drop policy if exists crm_leads_select_messe_created on public.crm_leads;
create policy crm_leads_select_messe_created
  on public.crm_leads
  for select
  to authenticated
  using (
    lower(trim(coalesce(crm_leads.trade_fair, ''))) in ('messe / exhibition', 'messe / udstilling')
    and exists (
      select 1
      from public.app_users actor
      where actor.id = crm_leads.created_by_user_id
        and actor.auth_user_id = (select auth.uid())
        and actor.is_active = true
        and actor.approved = true
        and lower(actor.status) in ('active', 'approved')
        and (
          lower(coalesce(actor.portal_variant, '')) = 'messe'
          or actor.portal_role::text = 'exhibition_user'
        )
    )
  );
