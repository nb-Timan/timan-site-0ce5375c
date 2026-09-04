-- A correction session permits content changes only. It can never remove the
-- canonical submitted marker or turn an order back into a draft.
create or replace function public.prevent_submitted_configurator_order_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_configuration_id uuid;
begin
  if tg_table_name = 'configurations' then
    if public.is_submitted_configurator_order(old) then
      if not public.has_active_submitted_configurator_order_correction(old.id) then
        raise exception 'Submitted configurator orders are read-only';
      end if;
      if not public.is_submitted_configurator_order(new) then
        raise exception 'Submitted configurator orders must remain submitted';
      end if;
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  target_configuration_id := case when tg_op = 'DELETE' then old.configuration_id else new.configuration_id end;
  if exists (
    select 1 from public.configurations c
    where c.id = target_configuration_id
      and public.is_submitted_configurator_order(c)
      and not public.has_active_submitted_configurator_order_correction(c.id)
  ) then
    raise exception 'Items on submitted configurator orders are read-only';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
