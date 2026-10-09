-- Published identity aliases allow exact prefix replacement in legacy Marketing
-- titles without exposing prices/costs or the editorial audit to public readers.
alter table public.price_list_published
  add column if not exists identity_aliases text[] not null default '{}';

-- Only seed a documented predecessor of the identity that is actually published.
update public.price_list_published p
set identity_aliases = array(
  select distinct h.old_value
  from public.price_list_item_history h
  where h.item_number = p.item_number and h.field_name = 'item_text_da'
    and h.new_value = p.item_text_da and h.changed_at <= p.published_at
    and nullif(btrim(h.old_value), '') is not null
)
where cardinality(p.identity_aliases) = 0;

create or replace function public.remember_published_product_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.item_text_da is distinct from new.item_text_da and nullif(btrim(old.item_text_da), '') is not null then
    new.identity_aliases := array(select distinct value from unnest(old.identity_aliases || array[old.item_text_da]) value);
  else
    new.identity_aliases := old.identity_aliases;
  end if;
  return new;
end;
$$;
create trigger remember_published_product_identity
before update on public.price_list_published
for each row execute function public.remember_published_product_identity();

create or replace function public.list_published_product_master()
returns table(item_number text, item_text_da text, price_dkk numeric, price_eur numeric,
  price_sek numeric, identity_aliases text[], published_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.item_number, p.item_text_da, p.price_dkk, p.price_eur, p.price_sek, p.identity_aliases, p.published_at
  from public.price_list_published p order by p.item_number;
$$;
revoke all on function public.list_published_product_master() from public, anon, authenticated;
grant execute on function public.list_published_product_master() to anon, authenticated;
revoke all on function public.remember_published_product_identity() from public, anon, authenticated;
-- Existing price-only RPC and publish permissions remain compatible.
