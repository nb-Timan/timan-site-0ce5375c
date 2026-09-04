-- Submitted configurator orders are immutable. Active order drafts keep their
-- O-number but remain editable until a canonical submission timestamp exists.

create or replace function public.is_submitted_configurator_order(
  configuration public.configurations
)
returns boolean
language sql
stable
set search_path = public
as $$
  select (
    (
      configuration.document_type = 'order'
      or configuration.case_type = 'order'
      or configuration.order_number is not null
    )
    and (
      configuration.submitted_at is not null
      or configuration.order_sent_at is not null
    )
  );
$$;

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
      raise exception 'Submitted configurator orders are read-only';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  target_configuration_id := case
    when tg_op = 'DELETE' then old.configuration_id
    else new.configuration_id
  end;

  if exists (
    select 1
    from public.configurations c
    where c.id = target_configuration_id
      and public.is_submitted_configurator_order(c)
  ) then
    raise exception 'Items on submitted configurator orders are read-only';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists prevent_submitted_configurator_order_changes on public.configurations;
create trigger prevent_submitted_configurator_order_changes
  before update or delete on public.configurations
  for each row execute function public.prevent_submitted_configurator_order_changes();

drop trigger if exists prevent_submitted_configurator_order_item_changes on public.configuration_items;
create trigger prevent_submitted_configurator_order_item_changes
  before insert or update or delete on public.configuration_items
  for each row execute function public.prevent_submitted_configurator_order_changes();
