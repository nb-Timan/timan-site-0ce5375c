-- Marketing Video management permission alignment.
--
-- Separates Marketing area visibility from editorial video management.
-- Existing users with the historical news_manage flag keep access until an
-- admin explicitly sets marketing_videos_manage=false.

create or replace function public.can_manage_marketing_videos()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and coalesce(au.is_active, false) = true
      and coalesce(au.approved, true) = true
      and (
        au.portal_role::text = 'timan_backend'
        or (
          au.portal_role::text in ('timan_seller', 'timan_service')
          and case
            when au.permissions ? 'marketing_videos_manage'
              then coalesce((au.permissions ->> 'marketing_videos_manage')::boolean, false)
            else coalesce((au.permissions ->> 'news_manage')::boolean, false)
          end
        )
      )
  );
$$;
