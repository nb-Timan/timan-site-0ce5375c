-- =====================================================================
-- PROPOSAL — Phase 57b: Portal-driven edits to warranty_registrations
--
-- NOT yet applied. Review and run manually when approved.
--
-- Goal:
--   Allow timan_backend / timan_service (and dealer-scoped users on their
--   own matched rows) to correct selected fields on warranty_registrations
--   from the portal, with every change captured in
--   warranty_registration_history.
--
-- Design:
--   - No new tables. Reuses warranty_registration_history.
--   - No direct UPDATE grant to authenticated. All writes go through
--     a SECURITY DEFINER RPC that:
--       * verifies caller scope (internal OR dealer-scoped owner),
--       * computes a field-level diff,
--       * writes a history row with snapshot (pre-image) + diff +
--         change_source='portal_edit' + acting auth_user_id,
--       * updates only the whitelisted columns.
--   - SharePoint sync is unchanged and still owns sharepoint_item_id,
--     sharepoint_modified_at, is_active_in_source, machine_serial_number
--     normalisation, dealer_match_status flips, etc.
--   - History reads remain internal-only for now (mirrors PII scope).
--     If dealers should see their own history later, add a scoped policy.
--
-- Whitelisted editable columns (server-enforced):
--   customer_name, customer_address, customer_postal_code, customer_city,
--   customer_country, customer_phone, customer_email,
--   delivery_date, machine_model, comment,
--   machine_serial_number          (internal roles only)
--   dealer_account_id +            (internal roles only — re-match)
--   dealer_account_number +
--   dealer_match_status            (forced to 'matched' on re-match)
-- =====================================================================

-- 0) Ensure history can carry the acting user. snapshot/diff are jsonb
--    so we just standardise the diff envelope shape in the RPC.

-- 1) RPC: warranty_update_registration
create or replace function public.warranty_update_registration(
  p_id      uuid,
  p_changes jsonb  -- { "customer_email": "x@y", "delivery_date": "2026-05-01", ... }
)
returns public.warranty_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.warranty_registrations%rowtype;
  v_after  public.warranty_registrations%rowtype;
  v_is_internal boolean := public.is_timan_global_warranty();
  v_scoped boolean;
  v_diff jsonb := '{}'::jsonb;
  v_key text;
  v_new jsonb;
  v_old_val text;
  v_new_val text;
  -- editable for everyone allowed to edit this row
  v_cols_common text[] := array[
    'customer_name','customer_address','customer_postal_code',
    'customer_city','customer_country','customer_phone','customer_email',
    'delivery_date','machine_model','comment'
  ];
  -- additionally editable for internal roles only
  v_cols_internal text[] := array[
    'machine_serial_number',
    'dealer_account_id','dealer_account_number'
  ];
begin
  select * into v_before from public.warranty_registrations where id = p_id;
  if not found then
    raise exception 'warranty_registration % not found', p_id using errcode = 'P0002';
  end if;

  v_scoped := v_before.dealer_account_id is not null
              and v_before.dealer_match_status = 'matched'
              and v_before.dealer_account_id in (select public.warranty_visible_dealer_ids());

  if not (v_is_internal or v_scoped) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  -- Build diff + UPDATE only on whitelisted keys.
  for v_key, v_new in select * from jsonb_each(coalesce(p_changes, '{}'::jsonb))
  loop
    if not (v_key = any(v_cols_common)
            or (v_is_internal and v_key = any(v_cols_internal))) then
      continue;
    end if;

    v_new_val := case when jsonb_typeof(v_new) = 'null' then null else v_new #>> '{}' end;

    execute format('select ($1).%I::text', v_key) into v_old_val using v_before;
    if v_old_val is not distinct from v_new_val then
      continue;
    end if;

    execute format(
      'update public.warranty_registrations set %I = $1 where id = $2',
      v_key
    ) using v_new_val, p_id;

    v_diff := v_diff || jsonb_build_object(
      v_key, jsonb_build_object('old', to_jsonb(v_old_val), 'new', to_jsonb(v_new_val))
    );
  end loop;

  if v_diff = '{}'::jsonb then
    return v_before;  -- nothing changed
  end if;

  -- On internal re-match the dealer link, force status to 'matched'
  -- so the constraint warranty_registrations_matched_requires_dealer holds.
  if v_is_internal and (p_changes ? 'dealer_account_id'
                        or p_changes ? 'dealer_account_number') then
    update public.warranty_registrations
       set dealer_match_status = 'matched',
           dealer_match_method = 'manual',
           dealer_match_reviewed_by = auth.uid(),
           dealer_match_reviewed_at = now()
     where id = p_id
       and dealer_account_id is not null
       and dealer_account_number is not null;
  end if;

  insert into public.warranty_registration_history
    (registration_id, change_source, snapshot, diff)
  values (
    p_id,
    'portal_edit',
    to_jsonb(v_before) || jsonb_build_object('_actor', auth.uid()),
    v_diff || jsonb_build_object('_actor', to_jsonb(auth.uid()))
  );

  select * into v_after from public.warranty_registrations where id = p_id;
  return v_after;
end;
$$;

revoke all on function public.warranty_update_registration(uuid, jsonb) from public;
grant execute on function public.warranty_update_registration(uuid, jsonb) to authenticated;


-- 2) Allow scoped users to read history for rows they can already see.
--    Internal users keep their global SELECT from phase57.
drop policy if exists wrh_scoped_select on public.warranty_registration_history;
create policy wrh_scoped_select
  on public.warranty_registration_history
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.warranty_registrations wr
       where wr.id = warranty_registration_history.registration_id
         and wr.dealer_account_id is not null
         and wr.dealer_match_status = 'matched'
         and wr.dealer_account_id in (select public.warranty_visible_dealer_ids())
    )
  );

-- =====================================================================
-- Verify after apply:
--   select proname from pg_proc where proname='warranty_update_registration';
--   select policyname from pg_policies where tablename='warranty_registration_history';
-- =====================================================================
