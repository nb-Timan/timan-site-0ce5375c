grant delete on table public.news_posts to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'news_posts'
      and policyname = 'news_posts_backend_delete'
  ) then
    create policy news_posts_backend_delete
      on public.news_posts
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.app_users au
          where au.auth_user_id = auth.uid()
            and au.is_active = true
            and au.approved = true
            and (
              au.portal_role = 'timan_backend'
              or coalesce((au.permissions ->> 'news_manage')::boolean, false) = true
            )
        )
      );
  end if;
end $$;
