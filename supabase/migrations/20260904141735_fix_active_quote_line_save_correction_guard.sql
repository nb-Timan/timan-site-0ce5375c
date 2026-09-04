-- Active, non-submitted quotes must use the normal seller edit path.
-- Submitted orders still require the existing Backend correction session.
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
    select *
      into target
      from public.configurations
     where id = target_id;

    if found and public.is_submitted_configurator_order(target) then
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
