-- Match the existing Marketing UI gate without granting external roles access
-- to internal changelog rows or the read-only public projection table.
drop policy if exists site_change_entries_admin_select on public.site_change_entries;
create policy site_change_entries_admin_select
on public.site_change_entries
for select
to authenticated
using (
  exists (
    select 1 from public.app_users au
    where au.auth_user_id = auth.uid()
      and au.approved = true
      and au.is_active = true
      and (
        au.portal_role = 'timan_backend'
        or (
          au.portal_role in ('timan_seller', 'timan_service')
          and (
            coalesce((au.permissions ->> 'news_manage')::boolean, false) = true
            or 'marketing' = any(coalesce(au.allowed_areas, array[]::text[]))
          )
        )
      )
  )
);

drop policy if exists site_change_entries_admin_insert on public.site_change_entries;
create policy site_change_entries_admin_insert
on public.site_change_entries
for insert
to authenticated
with check (
  exists (
    select 1 from public.app_users au
    where au.auth_user_id = auth.uid()
      and au.approved = true
      and au.is_active = true
      and (
        au.portal_role = 'timan_backend'
        or (
          au.portal_role in ('timan_seller', 'timan_service')
          and (
            coalesce((au.permissions ->> 'news_manage')::boolean, false) = true
            or 'marketing' = any(coalesce(au.allowed_areas, array[]::text[]))
          )
        )
      )
  )
);

drop policy if exists site_change_entries_admin_update on public.site_change_entries;
create policy site_change_entries_admin_update
on public.site_change_entries
for update
to authenticated
using (
  exists (
    select 1 from public.app_users au
    where au.auth_user_id = auth.uid()
      and au.approved = true
      and au.is_active = true
      and (
        au.portal_role = 'timan_backend'
        or (
          au.portal_role in ('timan_seller', 'timan_service')
          and (
            coalesce((au.permissions ->> 'news_manage')::boolean, false) = true
            or 'marketing' = any(coalesce(au.allowed_areas, array[]::text[]))
          )
        )
      )
  )
)
with check (
  exists (
    select 1 from public.app_users au
    where au.auth_user_id = auth.uid()
      and au.approved = true
      and au.is_active = true
      and (
        au.portal_role = 'timan_backend'
        or (
          au.portal_role in ('timan_seller', 'timan_service')
          and (
            coalesce((au.permissions ->> 'news_manage')::boolean, false) = true
            or 'marketing' = any(coalesce(au.allowed_areas, array[]::text[]))
          )
        )
      )
  )
);

drop policy if exists site_change_entries_admin_delete on public.site_change_entries;
create policy site_change_entries_admin_delete
on public.site_change_entries
for delete
to authenticated
using (
  exists (
    select 1 from public.app_users au
    where au.auth_user_id = auth.uid()
      and au.approved = true
      and au.is_active = true
      and (
        au.portal_role = 'timan_backend'
        or (
          au.portal_role in ('timan_seller', 'timan_service')
          and (
            coalesce((au.permissions ->> 'news_manage')::boolean, false) = true
            or 'marketing' = any(coalesce(au.allowed_areas, array[]::text[]))
          )
        )
      )
  )
);
