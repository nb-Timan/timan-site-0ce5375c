-- O-numbers are canonical submitted-order identifiers, never draft numbers.
-- This guard accepts the atomic submission update (number + timestamp in one
-- write) and rejects a future split transition at the database boundary.
create or replace function public.enforce_submitted_order_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.order_number is not null
    and new.submitted_at is null
    and new.order_sent_at is null then
    raise exception 'An order number requires a submitted or sent timestamp';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_submitted_order_number on public.configurations;
create trigger enforce_submitted_order_number
  before insert or update on public.configurations
  for each row execute function public.enforce_submitted_order_number();
