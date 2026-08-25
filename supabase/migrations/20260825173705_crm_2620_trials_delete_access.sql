grant delete on public.crm_2620_trials to authenticated;

drop policy if exists "crm_2620_trials_authenticated_delete" on public.crm_2620_trials;
create policy "crm_2620_trials_authenticated_delete"
  on public.crm_2620_trials
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where au.auth_user_id = auth.uid()
        and au.is_active = true
        and au.approved = true
        and au.portal_role in ('timan_backend', 'timan_service', 'timan_seller')
    )
  );
