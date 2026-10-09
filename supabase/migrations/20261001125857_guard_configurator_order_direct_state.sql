create or replace function public.guard_configurator_order_direct_state()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  effective_flow text := case
    when new.submitted_at is not null or new.order_sent_at is not null then 'order'
    else lower(coalesce(
      new.state_json ->> 'flowType',
      new.document_type,
      new.case_type,
      'quote'
    ))
  end;
  direct_enabled boolean := coalesce(new.state_json ->> 'pricingMode', '') = 'direct'
    or coalesce(new.state_json -> 'direct', 'false'::jsonb) = 'true'::jsonb;
begin
  if effective_flow = 'order' and direct_enabled then
    raise exception 'ORDER_DIRECT_NOT_ALLOWED';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_configurator_order_direct_state() from public, anon, authenticated;

drop trigger if exists guard_configurator_order_direct_state on public.configurations;
create trigger guard_configurator_order_direct_state
  before insert or update of state_json, case_type, document_type, submitted_at, order_sent_at
  on public.configurations
  for each row execute function public.guard_configurator_order_direct_state();
