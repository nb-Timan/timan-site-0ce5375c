-- Backend-only permanent CRM sales-document deletion.
--
-- A configuration is the canonical record for both Configurator quotes and
-- orders. It can point to a CRM lead, but deleting the document must never
-- delete that upstream sales opportunity. Operational audit_log entries remain
-- append-only; user-facing document activities are removed with the document.

-- Audit identifiers are historical references, like audit_log.record_id.
-- Retain both the sharing evidence and its original lead ID after deletion.
alter table public.crm_lead_share_audit_log
  drop constraint if exists crm_lead_share_audit_log_lead_id_fkey;

create or replace function public.prepare_backend_crm_deletion_actor(p_actor_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_email text;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Server-only operation' using errcode = '42501';
  end if;
  select u.email into actor_email
  from auth.users u
  where u.id = p_actor_auth_user_id and exists (
    select 1 from public.app_users a
    where a.portal_role = 'timan_backend' and a.approved is true and a.is_active is true
      and (a.auth_user_id = u.id or lower(trim(a.email)) = lower(trim(u.email)))
  );
  if not found then
    raise exception 'Active Timan Backend actor required' using errcode = '42501';
  end if;
  -- The Edge Function supplies only the identity returned by auth.getUser().
  -- Preserve that verified actor for the existing trigger and audit functions.
  perform set_config('request.jwt.claim.sub', p_actor_auth_user_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_actor_auth_user_id, 'email', actor_email, 'role', 'authenticated')::text, true);
end;
$$;
revoke all on function public.prepare_backend_crm_deletion_actor(uuid) from public, anon, authenticated;
grant execute on function public.prepare_backend_crm_deletion_actor(uuid) to service_role;

create or replace function public.sync_sent_configuration_quote_to_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.lead_id is not null and new.lead_id is null
    and current_setting('app.backend_permanent_lead_delete', true) = old.lead_id::text
    and public.is_timan_backend() then
    return new;
  end if;
  perform public.ensure_sent_configuration_quote_lead(new.id);
  return new;
end;
$$;

create or replace function public.prevent_submitted_configurator_order_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.configurations;
  target_ids uuid[];
  target_id uuid;
begin
  if tg_table_name = 'configurations' then
    if public.is_submitted_configurator_order(old) then
      -- Only the Backend-only permanent-delete RPC can remove a submitted
      -- order. The transient setting is transaction-local and never exposed
      -- through a client-callable SQL function.
      if tg_op = 'DELETE'
        and current_setting('app.backend_permanent_document_delete', true) = old.id::text
        and public.is_timan_backend() then
        return old;
      end if;

      if tg_op = 'UPDATE' and old.source_quote_id is not null and new.source_quote_id is null
        and current_setting('app.backend_permanent_document_delete', true) = old.source_quote_id::text
        and public.is_timan_backend()
        and (to_jsonb(new) - 'source_quote_id' - 'updated_at') is not distinct from (to_jsonb(old) - 'source_quote_id' - 'updated_at') then
        return new;
      end if;

      -- Removing a lead leaves its independent quotes/orders in place. This
      -- narrowly permits the RPC to clear that reference and nothing else.
      if tg_op = 'UPDATE'
        and old.lead_id is not null
        and current_setting('app.backend_permanent_lead_delete', true) = old.lead_id::text
        and new.lead_id is null
        and public.is_timan_backend()
        and (to_jsonb(new) - 'lead_id' - 'updated_at') is not distinct from (to_jsonb(old) - 'lead_id' - 'updated_at') then
        return new;
      end if;

      if current_setting('app.submitted_order_contact_edit', true) = old.id::text
        or current_setting('app.submitted_order_date_edit', true) = old.id::text then
        if tg_op <> 'DELETE' and not public.is_submitted_configurator_order(new) then
          raise exception 'Submitted configurator orders must remain submitted' using errcode = '42501';
        end if;
        return new;
      end if;
      if not public.has_active_submitted_configurator_order_correction(old.id) then
        raise exception 'Submitted configurator orders are read-only' using errcode = '42501';
      end if;
      if tg_op <> 'DELETE' and not public.is_submitted_configurator_order(new) then
        raise exception 'Submitted configurator orders must remain submitted' using errcode = '42501';
      end if;
    end if;

    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  target_ids := case
    when tg_op = 'INSERT' then array[new.configuration_id]
    when tg_op = 'DELETE' then array[old.configuration_id]
    else array_remove(array[old.configuration_id, new.configuration_id], null)
  end;

  foreach target_id in array target_ids loop
    select * into target from public.configurations where id = target_id;
    if found and public.is_submitted_configurator_order(target) then
      if tg_op = 'DELETE'
        and current_setting('app.backend_permanent_document_delete', true) = target.id::text
        and public.is_timan_backend() then
        continue;
      end if;
      if not public.has_active_submitted_configurator_order_correction(target.id) then
        raise exception 'Items on submitted configurator orders are read-only' using errcode = '42501';
      end if;
    end if;
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.prevent_submitted_configurator_order_changes() from public, anon, authenticated;

create or replace function public.delete_crm_sales_document(
  p_configuration_id uuid,
  p_actor_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.configurations%rowtype;
  removed_items integer := 0;
  removed_activities integer := 0;
  removed_hidden_rows integer := 0;
begin
  perform public.prepare_backend_crm_deletion_actor(p_actor_auth_user_id);
  if not public.is_timan_backend() then
    raise exception 'Only Timan Backend can permanently delete CRM quotes and orders' using errcode = '42501';
  end if;

  select * into target
  from public.configurations
  where id = p_configuration_id
  for update;

  if not found then
    raise exception 'CRM sales document not found' using errcode = 'P0002';
  end if;

  -- This setting is read only by the submitted-order trigger above and lasts
  -- for this RPC transaction only.
  perform set_config('app.backend_permanent_document_delete', target.id::text, true);

  -- Preserve independent orders originating from this quote, including their
  -- frozen snapshot and historical quote number, but remove the live pointer.
  update public.configurations set source_quote_id = null where source_quote_id = target.id;

  -- These activities describe the document itself. Audit log rows are not
  -- touched: they are the canonical append-only administrative audit trail.
  delete from public.crm_activities
  where configuration_id = target.id
     or quote_id = target.id
     or order_id = target.id;
  get diagnostics removed_activities = row_count;

  -- The legacy per-user hide table is optional in older environments.
  if to_regclass('public.configuration_user_hidden') is not null then
    execute 'delete from public.configuration_user_hidden where configuration_id = $1'
      using target.id;
    get diagnostics removed_hidden_rows = row_count;
  end if;

  delete from public.configuration_items where configuration_id = target.id;
  get diagnostics removed_items = row_count;

  -- configurator_order_correction_sessions safely cascades from this row.
  -- The linked CRM lead deliberately remains intact.
  delete from public.configurations where id = target.id;

  return jsonb_build_object(
    'configuration_id', target.id,
    'document_number', coalesce(target.order_number, target.quote_number, target.id::text),
    'linked_lead_id', target.lead_id,
    'removed_configuration_items', removed_items,
    'removed_document_activities', removed_activities,
    'removed_hidden_rows', removed_hidden_rows
  );
end;
$$;

revoke all on function public.delete_crm_sales_document(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_crm_sales_document(uuid, uuid) to service_role;

create or replace function public.delete_crm_lead_permanently(
  p_lead_id uuid,
  p_actor_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.crm_leads%rowtype;
  demo_ids uuid[] := '{}'::uuid[];
  unlinked_documents integer := 0;
  removed_activities integer := 0;
  removed_demos integer := 0;
  removed_calendar_entries integer := 0;
begin
  perform public.prepare_backend_crm_deletion_actor(p_actor_auth_user_id);
  if not public.is_timan_backend() then
    raise exception 'Only Timan Backend can permanently delete CRM leads' using errcode = '42501';
  end if;

  select * into target
  from public.crm_leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'CRM lead not found' using errcode = 'P0002';
  end if;

  perform set_config('app.backend_permanent_lead_delete', target.id::text, true);

  -- Quotes/orders are independent commercial documents. Keep them, but clear
  -- the relation so no record points at a deleted lead.
  update public.configurations
     set lead_id = null
   where lead_id = target.id;
  get diagnostics unlinked_documents = row_count;

  select coalesce(array_agg(id), '{}'::uuid[])
    into demo_ids
  from public.crm_demo_leads
  where source_lead_id = target.id;

  -- Demo calendar entries are exclusive to their demo records. Delete them
  -- before the demo trigger clears its relation.
  delete from public.crm_calendar_activities
  where lead_id = target.id
     or demo_lead_id = any(demo_ids);
  get diagnostics removed_calendar_entries = row_count;

  delete from public.crm_demo_leads where id = any(demo_ids);
  get diagnostics removed_demos = row_count;

  delete from public.crm_activities
  where (lead_id = target.id or meta ->> 'lead_id' = target.id::text)
    and configuration_id is null and quote_id is null and order_id is null;
  get diagnostics removed_activities = row_count;

  update public.crm_activities set lead_id = null, meta = meta - 'lead_id'
  where lead_id = target.id or meta ->> 'lead_id' = target.id::text;

  -- crm_lead_shares, budget_references and note-calendar relations use their
  -- existing FK cascades. audit_log deliberately remains append-only.
  delete from public.crm_leads where id = target.id;

  return jsonb_build_object(
    'lead_id', target.id,
    'lead_no', target.lead_no,
    'unlinked_configurations', unlinked_documents,
    'removed_demos', removed_demos,
    'removed_calendar_entries', removed_calendar_entries,
    'removed_lead_activities', removed_activities
  );
end;
$$;

revoke all on function public.delete_crm_lead_permanently(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_crm_lead_permanently(uuid, uuid) to service_role;
