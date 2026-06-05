-- =====================================================================
-- PROPOSAL — Phase 57b (rev 2): Portal-driven edits to warranty_registrations
--
-- NOT yet applied. Review and run manually in Supabase SQL editor.
--
-- Goal:
--   Allow timan_backend / timan_service (internal) and dealer-scoped users
--   on their OWN matched rows to correct selected fields on
--   warranty_registrations from the portal, with every change captured in
--   warranty_registration_history.
--
-- Confirmed invariants (unchanged from rev 1):
--   * No hard delete. RPC only UPDATEs whitelisted columns.
--   * No direct UPDATE grant to `authenticated`. All writes go through the
--     SECURITY DEFINER RPC below.
--   * Every change writes a row to warranty_registration_history with
--     snapshot (pre-image) + diff + change_source='portal_edit' + actor.
--   * SharePoint sync is NOT touched. It still owns sharepoint_item_id,
--     sharepoint_form_id, sharepoint_modified_at, is_active_in_source,
--     and serial-normalisation.
--   * Dealer-scoped users (forhandler / importør / service partner /
--     seller) can only edit their own matched rows (dealer_account_id in
--     warranty_visible_dealer_ids()).
--   * Internal users (timan_backend, timan_service) can edit any row,
--     plus the dealer link + machine_serial_number.
--
-- Changes vs rev 1:
--   1. Per-column type-safe casting (date / uuid / text) instead of
--      forcing every field to text in the UPDATE.
--   2. Empty strings normalised to NULL for nullable columns.
--   3. Dealer re-match validates dealer_account_id AND dealer_account_number
--      against public.dealer_accounts BEFORE writing, and only flips
--      dealer_match_status to 'matched' when both are valid and consistent.
--   4. The forced dealer_match_status / method / reviewer changes are now
--      included in the diff written to warranty_registration_history.
--   5. `comment` column existence verified in phase57 schema — kept in
--      the common whitelist.
--   6. Portal edit may RE-MATCH the dealer link to another valid dealer,
--      but it can NEVER clear it. Clearing must go through the proper
--      matching workflow.

-- ---------------------------------------------------------------------
-- 1) RPC: warranty_update_registration
-- ---------------------------------------------------------------------
create or replace function public.warranty_update_registration(
  p_id      uuid,
  p_changes jsonb  -- e.g. { "customer_email": "x@y", "delivery_date": "2026-05-01" }
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
  v_old_text text;
  v_new_text text;          -- normalised string (empty -> null)
  v_new_date date;
  v_new_uuid uuid;

  -- candidate dealer re-match values (only relevant for internal callers)
  v_target_dealer_id    uuid;
  v_target_dealer_no    text;
  v_dealer_id_provided  boolean := false;
  v_dealer_no_provided  boolean := false;
  v_dealer_row          public.dealer_accounts%rowtype;
  v_old_status          text;

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
  select * into v_before
    from public.warranty_registrations
   where id = p_id
   for update;
  if not found then
    raise exception 'warranty_registration % not found', p_id
      using errcode = 'P0002';
  end if;

  v_old_status := v_before.dealer_match_status;

  v_scoped := v_before.dealer_account_id is not null
              and v_before.dealer_match_status = 'matched'
              and v_before.dealer_account_id in (select public.warranty_visible_dealer_ids());

  if not (v_is_internal or v_scoped) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  -- -----------------------------------------------------------------
  -- 1a) If internal caller is re-matching the dealer link, validate the
  --     target dealer BEFORE any writes.
  -- -----------------------------------------------------------------
  if v_is_internal then
    v_dealer_id_provided := p_changes ? 'dealer_account_id';
    v_dealer_no_provided := p_changes ? 'dealer_account_number';

    if v_dealer_id_provided then
      v_new_text := nullif(btrim(coalesce(p_changes ->> 'dealer_account_id', '')), '');
      begin
        v_target_dealer_id := case when v_new_text is null then null else v_new_text::uuid end;
      exception when others then
        raise exception 'dealer_account_id is not a valid uuid: %', v_new_text
          using errcode = '22P02';
      end;
    else
      v_target_dealer_id := v_before.dealer_account_id;
    end if;

    if v_dealer_no_provided then
      v_target_dealer_no := nullif(btrim(coalesce(p_changes ->> 'dealer_account_number', '')), '');
    else
      v_target_dealer_no := v_before.dealer_account_number;
    end if;

    -- Portal edit may re-match to a different VALID dealer, but it must
    -- NEVER clear the dealer link (that would break the
    -- warranty_registrations_matched_requires_dealer invariant and
    -- bypass the proper unlink / matching workflow).
    if v_dealer_id_provided or v_dealer_no_provided then
      if v_target_dealer_id is null or v_target_dealer_no is null then
        raise exception
          'Dealer link cannot be cleared from portal edit. Use matching workflow.'
          using errcode = '22023';
      end if;

      select * into v_dealer_row
        from public.dealer_accounts
       where id = v_target_dealer_id;
      if not found then
        raise exception 'dealer_account % not found', v_target_dealer_id
          using errcode = 'P0002';
      end if;

      if lower(btrim(coalesce(v_dealer_row.account_number, '')))
         <> lower(btrim(v_target_dealer_no)) then
        raise exception
          'dealer_account_number % does not match dealer_account %',
          v_target_dealer_no, v_target_dealer_id
          using errcode = '22023';
      end if;
    end if;
  end if;

  -- -----------------------------------------------------------------
  -- 1b) Apply whitelisted changes one column at a time, with proper
  --     per-column type casting and empty-string -> NULL.
  -- -----------------------------------------------------------------
  for v_key, v_new in select * from jsonb_each(coalesce(p_changes, '{}'::jsonb))
  loop
    if not (v_key = any(v_cols_common)
            or (v_is_internal and v_key = any(v_cols_internal))) then
      continue;
    end if;

    -- normalise incoming value into a string ("null" json -> NULL,
    -- empty / whitespace-only -> NULL)
    if jsonb_typeof(v_new) = 'null' then
      v_new_text := null;
    else
      v_new_text := nullif(btrim(v_new #>> '{}'), '');
    end if;

    -- read old value as text for diff comparison
    execute format('select ($1).%I::text', v_key) into v_old_text using v_before;
    if v_old_text is not distinct from v_new_text then
      continue;
    end if;

    if v_key = 'delivery_date' then
      begin
        v_new_date := case when v_new_text is null then null else v_new_text::date end;
      exception when others then
        raise exception 'delivery_date is not a valid date: %', v_new_text
          using errcode = '22007';
      end;
      update public.warranty_registrations
         set delivery_date = v_new_date
       where id = p_id;

    elsif v_key = 'dealer_account_id' then
      -- already validated above; cast safely
      v_new_uuid := case when v_new_text is null then null else v_new_text::uuid end;
      update public.warranty_registrations
         set dealer_account_id = v_new_uuid
       where id = p_id;

    else
      -- all remaining whitelisted columns are text
      execute format(
        'update public.warranty_registrations set %I = $1 where id = $2',
        v_key
      ) using v_new_text, p_id;
    end if;

    v_diff := v_diff || jsonb_build_object(
      v_key, jsonb_build_object('old', to_jsonb(v_old_text), 'new', to_jsonb(v_new_text))
    );
  end loop;

  -- -----------------------------------------------------------------
  -- 1c) On a valid internal re-match, force dealer_match_status to
  --     'matched' (the table constraint requires both link columns set
  --     for 'matched'). Capture the forced changes in the diff too.
  -- -----------------------------------------------------------------
  if v_is_internal
     and (v_dealer_id_provided or v_dealer_no_provided)
     and v_target_dealer_id is not null
     and v_target_dealer_no is not null
  then
    update public.warranty_registrations
       set dealer_match_status   = 'matched',
           dealer_match_method   = 'manual',
           dealer_match_reviewed_by = auth.uid(),
           dealer_match_reviewed_at = now()
     where id = p_id;

    if v_old_status is distinct from 'matched' then
      v_diff := v_diff || jsonb_build_object(
        'dealer_match_status',
        jsonb_build_object('old', to_jsonb(v_old_status), 'new', to_jsonb('matched'::text))
      );
    end if;
    v_diff := v_diff || jsonb_build_object(
      'dealer_match_method',
      jsonb_build_object(
        'old', to_jsonb(v_before.dealer_match_method),
        'new', to_jsonb('manual'::text)
      )
    );
  end if;

  if v_diff = '{}'::jsonb then
    return v_before;  -- nothing actually changed
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


-- ---------------------------------------------------------------------
-- 2) Allow scoped users to read history for rows they can already see.
--    Internal users keep their global SELECT from phase57.
-- ---------------------------------------------------------------------
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
--   select proname from pg_proc where proname = 'warranty_update_registration';
--   select policyname from pg_policies where tablename = 'warranty_registration_history';
-- =====================================================================
