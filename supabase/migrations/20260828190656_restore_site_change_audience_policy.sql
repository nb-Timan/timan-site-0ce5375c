-- Repair the public changelog audience policy on remote.
-- The original cleanup migration is marked as applied, but the active remote
-- policy still reflected an older external-role bucket without dealer_customer.

drop policy if exists site_change_public_role_read on public.site_change_public_entries;

create policy site_change_public_role_read
on public.site_change_public_entries
for select
to authenticated
using (
  'all' = any(affected_roles)
  or exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and (
        au.portal_role::text = 'timan_backend'
        or au.portal_role::text = any(affected_roles)
        or (au.portal_role::text = 'timan_seller' and 'sales' = any(affected_roles))
        or (au.portal_role::text = 'timan_service' and 'service' = any(affected_roles))
        or (
          au.portal_role::text in (
            'timan_dealer',
            'dealer_user',
            'timan_importer',
            'timan_service_partner',
            'dealer_customer'
          )
          and 'dealer' = any(affected_roles)
        )
        or (au.portal_role::text = 'exhibition_user' and 'timan_messe' = any(affected_roles))
        or ((au.role = 'timan_saelger') and 'sales' = any(affected_roles))
        or ((au.role = 'partner') and 'dealer' = any(affected_roles))
      )
  )
);
