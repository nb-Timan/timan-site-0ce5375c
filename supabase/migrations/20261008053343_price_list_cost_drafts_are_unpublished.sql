-- Keep the existing canonical staged-row flag in sync when a cost price is
-- changed. The release RPC remains the only operation that clears is_dirty
-- and advances last_published_at.

create or replace function public.mark_price_list_cost_draft_unpublished()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.cost_price_dkk is not null then
      new.is_dirty := true;
    end if;
  elsif new.cost_price_dkk is distinct from old.cost_price_dkk then
    new.is_dirty := true;
  end if;
  return new;
end;
$$;

revoke all on function public.mark_price_list_cost_draft_unpublished() from public, anon, authenticated;

drop trigger if exists price_list_cost_draft_unpublished on public.price_list_items;
create trigger price_list_cost_draft_unpublished
before insert or update of cost_price_dkk on public.price_list_items
for each row
execute function public.mark_price_list_cost_draft_unpublished();

-- Repair cost-only drafts that were saved by the former write path without
-- is_dirty. Timestamps are the existing canonical release boundary for cost,
-- which is deliberately excluded from the selling-price snapshot/history.
update public.price_list_items
set is_dirty = true
where is_dirty = false
  and cost_price_dkk is not null
  and cost_price_updated_at is not null
  and (last_published_at is null or cost_price_updated_at > last_published_at);

comment on function public.mark_price_list_cost_draft_unpublished() is
  'Keeps canonical price_list_items.is_dirty true for unpublished cost-price changes.';
