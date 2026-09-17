-- Backend-only administrative correction of displayed order dates. The narrow
-- RPC leaves commercial data, delivery date, lifecycle status, and sending
-- history untouched while writing an explicit audit entry.
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
    if found and public.is_submitted_configurator_order(target)
      and not public.has_active_submitted_configurator_order_correction(target.id) then
      raise exception 'Items on submitted configurator orders are read-only' using errcode = '42501';
    end if;
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.prevent_submitted_configurator_order_changes() from public, anon, authenticated;

create or replace function public.update_submitted_order_timeline_dates(
  p_configuration_id uuid,
  p_created_date date,
  p_order_sent_date date
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target public.configurations;
  actor record;
  next_created_at timestamptz;
  next_order_sent_at timestamptz;
  changed text[] := array[]::text[];
begin
  if not public.is_timan_backend() then
    raise exception 'Only Timan Backend can edit submitted-order dates' using errcode = '42501';
  end if;
  if p_created_date is null or p_order_sent_date is null then
    raise exception 'Created and sent dates are required' using errcode = '22023';
  end if;
  if p_order_sent_date < p_created_date then
    raise exception 'Sent date cannot be before created date' using errcode = '22023';
  end if;

  select * into target from public.configurations where id = p_configuration_id for update;
  if not found or not public.is_submitted_configurator_order(target) then
    raise exception 'Only submitted orders can be edited here' using errcode = '22023';
  end if;

  next_created_at := (p_created_date::timestamp + (target.created_at at time zone 'UTC')::time) at time zone 'UTC';
  next_order_sent_at := (p_order_sent_date::timestamp + coalesce((target.order_sent_at at time zone 'UTC')::time, time '12:00:00')) at time zone 'UTC';
  if target.created_at is distinct from next_created_at then changed := array_append(changed, 'created_at'); end if;
  if target.order_sent_at is distinct from next_order_sent_at then changed := array_append(changed, 'order_sent_at'); end if;
  if cardinality(changed) = 0 then return; end if;

  perform set_config('app.submitted_order_date_edit', target.id::text, true);
  update public.configurations
     set created_at = next_created_at,
         order_sent_at = next_order_sent_at
   where id = target.id;

  select * into actor from public.audit_current_actor();
  insert into public.audit_log (
    actor_user_id, actor_email, actor_name, actor_role,
    action, module, record_type, record_id, record_label,
    old_value, new_value, changed_fields, status
  ) values (
    actor.actor_user_id, actor.actor_email, actor.actor_name, actor.actor_role,
    'submitted_order_dates_updated', 'configurator', 'configurations', target.id::text,
    coalesce(target.order_number, target.quote_number, target.id::text),
    jsonb_build_object('created_at', target.created_at, 'order_sent_at', target.order_sent_at),
    jsonb_build_object('created_at', next_created_at, 'order_sent_at', next_order_sent_at),
    changed, 'success'
  );
end;
$$;

revoke all on function public.update_submitted_order_timeline_dates(uuid, date, date) from public, anon;
grant execute on function public.update_submitted_order_timeline_dates(uuid, date, date) to authenticated;
