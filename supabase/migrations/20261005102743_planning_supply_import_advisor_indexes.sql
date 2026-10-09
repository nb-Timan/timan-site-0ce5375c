create index planning_supply_import_batches_actor_idx
  on public.planning_supply_import_batches (imported_by);
create index planning_supply_import_rows_unit_idx
  on public.planning_supply_import_batch_rows (supply_unit_id)
  where supply_unit_id is not null;

drop policy planning_supply_import_batches_backend_read
  on public.planning_supply_import_batches;
create policy planning_supply_import_batches_backend_read
  on public.planning_supply_import_batches for select to authenticated
  using (
    public.can_access_planning() and exists (
      select 1 from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.portal_role::text = 'timan_backend'
        and u.approved is true and u.is_active is true
    )
  );

drop policy planning_supply_import_rows_backend_read
  on public.planning_supply_import_batch_rows;
create policy planning_supply_import_rows_backend_read
  on public.planning_supply_import_batch_rows for select to authenticated
  using (
    public.can_access_planning() and exists (
      select 1 from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.portal_role::text = 'timan_backend'
        and u.approved is true and u.is_active is true
    )
  );
