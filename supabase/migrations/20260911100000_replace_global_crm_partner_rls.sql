-- Replace the three legacy permissive policies that bypassed every scoped
-- policy through PostgreSQL's OR semantics. The collaboration-manager resolver
-- is established by the earlier organization-access migration.

alter table public.configurations enable row level security;
alter table public.crm_activities enable row level security;
alter table public.dealer_accounts enable row level security;

drop policy if exists configurations_all on public.configurations;
drop policy if exists crm_activities_all on public.crm_activities;
drop policy if exists dealer_accounts_select on public.dealer_accounts;

drop policy if exists configurations_scoped_access on public.configurations;
create policy configurations_scoped_access
  on public.configurations
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.app_users actor
      where coalesce(actor.approved, false) = true
        and coalesce(actor.is_active, false) = true
        and (
          actor.auth_user_id = (select auth.uid())
          or lower(trim(actor.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(actor.portal_role::text, actor.role) in ('timan_backend', 'timan_service')
          or (
            coalesce(actor.portal_role::text, actor.role) = 'timan_seller'
            and (
              configurations.assigned_seller_id = actor.id
              or lower(coalesce(configurations.seller_email, '')) = lower(actor.email)
              or configurations.created_by_user_id in (actor.id, actor.auth_user_id)
            )
          )
          or (
            coalesce(actor.portal_role::text, actor.role) in (
              'timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_customer', 'dealer_user'
            )
            and configurations.dealer_number = actor.dealer_number
          )
          or configurations.dealer_number in (
            select scoped.account_number
            from public.resolve_collaboration_manager_accounts() scoped
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.app_users actor
      where coalesce(actor.approved, false) = true
        and coalesce(actor.is_active, false) = true
        and (
          actor.auth_user_id = (select auth.uid())
          or lower(trim(actor.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(actor.portal_role::text, actor.role) in ('timan_backend', 'timan_service')
          or (
            coalesce(actor.portal_role::text, actor.role) = 'timan_seller'
            and (
              configurations.assigned_seller_id = actor.id
              or lower(coalesce(configurations.seller_email, '')) = lower(actor.email)
              or configurations.created_by_user_id in (actor.id, actor.auth_user_id)
            )
          )
          or (
            coalesce(actor.portal_role::text, actor.role) in (
              'timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_customer', 'dealer_user'
            )
            and configurations.dealer_number = actor.dealer_number
          )
        )
    )
  );

drop policy if exists dealer_accounts_select_scoped on public.dealer_accounts;
create policy dealer_accounts_select_scoped
  on public.dealer_accounts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.app_users actor
      where coalesce(actor.approved, false) = true
        and coalesce(actor.is_active, false) = true
        and (
          actor.auth_user_id = (select auth.uid())
          or lower(trim(actor.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(actor.portal_role::text, actor.role) in ('timan_backend', 'timan_service')
          or (
            coalesce(actor.portal_role::text, actor.role) = 'timan_seller'
            and (
              dealer_accounts.assigned_seller_id = actor.id
              or lower(coalesce(dealer_accounts.assigned_seller_email, '')) = lower(actor.email)
            )
          )
          or (
            coalesce(actor.portal_role::text, actor.role) in (
              'timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_customer', 'dealer_user'
            )
            and dealer_accounts.account_number = actor.dealer_number
          )
          or dealer_accounts.account_number in (
            select scoped.account_number
            from public.resolve_collaboration_manager_accounts() scoped
          )
        )
    )
  );

drop policy if exists crm_activities_scoped_access on public.crm_activities;
create policy crm_activities_scoped_access
  on public.crm_activities
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.app_users actor
      where coalesce(actor.approved, false) = true
        and coalesce(actor.is_active, false) = true
        and (
          actor.auth_user_id = (select auth.uid())
          or lower(trim(actor.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(actor.portal_role::text, actor.role) in ('timan_backend', 'timan_service')
          or (
            coalesce(actor.portal_role::text, actor.role) = 'timan_seller'
            and (
              exists (
                select 1
                from public.dealer_accounts account
                where account.id = crm_activities.account_id
                  and (
                    account.assigned_seller_id = actor.id
                    or lower(coalesce(account.assigned_seller_email, '')) = lower(actor.email)
                  )
              )
              or exists (
                select 1
                from public.configurations configuration
                where configuration.id = crm_activities.configuration_id
                  and (
                    configuration.assigned_seller_id = actor.id
                    or lower(coalesce(configuration.seller_email, '')) = lower(actor.email)
                    or configuration.created_by_user_id in (actor.id, actor.auth_user_id)
                  )
              )
            )
          )
          or (
            coalesce(actor.portal_role::text, actor.role) in (
              'timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_customer', 'dealer_user'
            )
            and (
              exists (
                select 1
                from public.dealer_accounts account
                where account.id = crm_activities.account_id
                  and account.account_number = actor.dealer_number
              )
              or exists (
                select 1
                from public.configurations configuration
                where configuration.id = crm_activities.configuration_id
                  and configuration.dealer_number = actor.dealer_number
              )
            )
          )
          or exists (
            select 1
            from public.resolve_collaboration_manager_accounts() scoped
            where scoped.id = crm_activities.account_id
              or exists (
                select 1
                from public.configurations configuration
                where configuration.id = crm_activities.configuration_id
                  and configuration.dealer_number = scoped.account_number
              )
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.app_users actor
      where coalesce(actor.approved, false) = true
        and coalesce(actor.is_active, false) = true
        and (
          actor.auth_user_id = (select auth.uid())
          or lower(trim(actor.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(actor.portal_role::text, actor.role) in ('timan_backend', 'timan_service')
          or (
            coalesce(actor.portal_role::text, actor.role) = 'timan_seller'
            and (
              exists (
                select 1
                from public.dealer_accounts account
                where account.id = crm_activities.account_id
                  and (
                    account.assigned_seller_id = actor.id
                    or lower(coalesce(account.assigned_seller_email, '')) = lower(actor.email)
                  )
              )
              or exists (
                select 1
                from public.configurations configuration
                where configuration.id = crm_activities.configuration_id
                  and (
                    configuration.assigned_seller_id = actor.id
                    or lower(coalesce(configuration.seller_email, '')) = lower(actor.email)
                    or configuration.created_by_user_id in (actor.id, actor.auth_user_id)
                  )
              )
            )
          )
          or (
            coalesce(actor.portal_role::text, actor.role) in (
              'timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_customer', 'dealer_user'
            )
            and (
              exists (
                select 1
                from public.dealer_accounts account
                where account.id = crm_activities.account_id
                  and account.account_number = actor.dealer_number
              )
              or exists (
                select 1
                from public.configurations configuration
                where configuration.id = crm_activities.configuration_id
                  and configuration.dealer_number = actor.dealer_number
              )
            )
          )
        )
    )
  );
