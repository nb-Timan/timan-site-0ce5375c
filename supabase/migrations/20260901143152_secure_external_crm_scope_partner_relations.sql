-- SECURITY: finalize scoped external CRM access using the current canonical
-- partner relation model. This intentionally avoids the legacy dealer-link
-- table dependency.

create or replace function public.is_protected_internal_crm_account(
  p_account_number text,
  p_company_name text default null,
  p_branch_name text default null
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(trim(coalesce(p_account_number, ''))) = '100'
    and (
      lower(trim(coalesce(p_company_name, ''))) = 'timan'
      or lower(trim(coalesce(p_branch_name, ''))) = 'timan'
    );
$$;

alter table public.crm_leads enable row level security;
alter table public.crm_demo_leads enable row level security;

drop policy if exists crm_leads_all on public.crm_leads;
drop policy if exists crm_leads_select_scoped on public.crm_leads;
create policy crm_leads_select_scoped
  on public.crm_leads
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service')
          or (
            coalesce(au.portal_role::text, au.role) = 'timan_seller'
            and (
              crm_leads.owner_user_id = au.id
              or lower(coalesce(crm_leads.owner_email, '')) = lower(au.email)
            )
          )
          or exists (
            select 1
            from public.crm_lead_shares cls
            where cls.lead_id = crm_leads.id
              and cls.shared_with_user_id = au.id
              and cls.revoked_at is null
          )
          or exists (
            select 1
            from public.dealer_accounts own
            join public.dealer_accounts da on da.id = crm_leads.linked_dealer_id
            where coalesce(au.portal_role::text, au.role) in ('timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_customer', 'dealer_user')
              and own.account_number = au.dealer_number
              and not public.is_protected_internal_crm_account(own.account_number, own.company_name, own.branch_name)
              and not public.is_protected_internal_crm_account(da.account_number, da.company_name, da.branch_name)
              and (
                da.id = own.id
                or (
                  coalesce(au.portal_role::text, au.role) in ('timan_dealer', 'dealer_user', 'dealer_customer', 'timan_importer')
                  and da.parent_account_number = au.dealer_number
                )
                or (
                  coalesce(au.portal_role::text, au.role) = 'timan_service_partner'
                  and exists (
                    select 1
                    from public.partner_account_relations par
                    where par.source_account_id = own.id
                      and par.target_account_id = da.id
                      and par.relation_type = 'service_partner_has_dealer'
                      and par.active = true
                  )
                )
              )
          )
        )
    )
  );

drop policy if exists crm_leads_insert_scoped on public.crm_leads;
create policy crm_leads_insert_scoped
  on public.crm_leads
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service', 'timan_seller')
          or (
            crm_leads.owner_user_id = au.id
            and exists (
              select 1
              from public.dealer_accounts own
              join public.dealer_accounts da on da.id = crm_leads.linked_dealer_id
              where coalesce(au.portal_role::text, au.role) in ('timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_customer', 'dealer_user')
                and own.account_number = au.dealer_number
                and da.id = own.id
                and not public.is_protected_internal_crm_account(own.account_number, own.company_name, own.branch_name)
                and not public.is_protected_internal_crm_account(da.account_number, da.company_name, da.branch_name)
            )
          )
        )
    )
  );

drop policy if exists crm_leads_update_scoped on public.crm_leads;
create policy crm_leads_update_scoped
  on public.crm_leads
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service')
          or (coalesce(au.portal_role::text, au.role) = 'timan_seller' and crm_leads.owner_user_id = au.id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service')
          or (coalesce(au.portal_role::text, au.role) = 'timan_seller' and crm_leads.owner_user_id = au.id)
        )
    )
  );

drop policy if exists crm_leads_delete_scoped on public.crm_leads;
create policy crm_leads_delete_scoped
  on public.crm_leads
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service')
    )
  );

drop policy if exists crm_demo_leads_all on public.crm_demo_leads;
drop policy if exists crm_demo_leads_select_scoped on public.crm_demo_leads;
create policy crm_demo_leads_select_scoped
  on public.crm_demo_leads
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service')
          or (
            coalesce(au.portal_role::text, au.role) = 'timan_seller'
            and (
              crm_demo_leads.owner_user_id = au.id
              or lower(coalesce(crm_demo_leads.owner_email, '')) = lower(au.email)
            )
          )
          or exists (
            select 1
            from public.dealer_accounts own
            join public.dealer_accounts da on (
              da.id = own.id
              or (
                coalesce(au.portal_role::text, au.role) in ('timan_dealer', 'dealer_user', 'dealer_customer', 'timan_importer')
                and da.parent_account_number = au.dealer_number
              )
              or (
                coalesce(au.portal_role::text, au.role) = 'timan_service_partner'
                and exists (
                  select 1
                  from public.partner_account_relations par
                  where par.source_account_id = own.id
                    and par.target_account_id = da.id
                    and par.relation_type = 'service_partner_has_dealer'
                    and par.active = true
                )
              )
            )
            cross join lateral unnest(array[da.company_name, da.branch_name, da.account_number]) as dealer_names(v)
            where coalesce(au.portal_role::text, au.role) in ('timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_customer', 'dealer_user')
              and own.account_number = au.dealer_number
              and not public.is_protected_internal_crm_account(own.account_number, own.company_name, own.branch_name)
              and not public.is_protected_internal_crm_account(da.account_number, da.company_name, da.branch_name)
              and lower(trim(coalesce(crm_demo_leads.dealer_company, ''))) = lower(trim(dealer_names.v))
          )
        )
    )
  );

drop policy if exists crm_demo_leads_insert_scoped on public.crm_demo_leads;
create policy crm_demo_leads_insert_scoped
  on public.crm_demo_leads
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service', 'timan_seller', 'timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_customer', 'dealer_user')
    )
  );

drop policy if exists crm_demo_leads_update_scoped on public.crm_demo_leads;
create policy crm_demo_leads_update_scoped
  on public.crm_demo_leads
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service')
          or (coalesce(au.portal_role::text, au.role) = 'timan_seller' and crm_demo_leads.owner_user_id = au.id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service')
          or (coalesce(au.portal_role::text, au.role) = 'timan_seller' and crm_demo_leads.owner_user_id = au.id)
        )
    )
  );

drop policy if exists crm_demo_leads_delete_scoped on public.crm_demo_leads;
create policy crm_demo_leads_delete_scoped
  on public.crm_demo_leads
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service')
    )
  );
