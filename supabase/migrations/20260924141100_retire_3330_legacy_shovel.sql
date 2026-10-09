-- Current availability belongs to Product Master; commercial history stays intact.
alter table public.price_list_items add column is_active boolean not null default true;

-- Reuse the existing catalogue's verified values; no German/SEK value is invented.
insert into public.price_list_items (item_number, item_text_da, item_text_en, price_dkk, price_eur, is_dirty, last_published_at)
values ('730035', 'Skovl Timan 3330', 'Bucket Timan 3330', 12500, 1695, false, now())
on conflict (item_number) do nothing;

insert into public.price_list_published (item_number, item_text_da, item_text_de, item_text_en, price_dkk, price_eur, price_sek)
select item_number, item_text_da, item_text_de, item_text_en, price_dkk, price_eur, price_sek
from public.price_list_items where item_number = '730035'
on conflict (item_number) do nothing;

update public.price_list_items set is_active = false where item_number = '730107';

-- Current localized product identity is live immediately after Backend save,
-- while prices remain sourced exclusively from the controlled published table.
drop function public.list_published_product_master();
create function public.list_published_product_master()
returns table(
  item_number text,
  item_text_da text,
  item_text_de text,
  item_text_en text,
  price_dkk numeric,
  price_eur numeric,
  price_sek numeric,
  identity_aliases text[],
  published_at timestamptz,
  is_active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    published.item_number,
    coalesce(current_item.item_text_da, published.item_text_da),
    case when current_item.item_number is not null then current_item.item_text_de else published.item_text_de end,
    case when current_item.item_number is not null then current_item.item_text_en else published.item_text_en end,
    published.price_dkk,
    published.price_eur,
    published.price_sek,
    array(
      select distinct alias
      from unnest(
        coalesce(published.identity_aliases, '{}'::text[])
        || array[published.item_text_da, published.item_text_de, published.item_text_en]
      ) as alias
      where nullif(btrim(alias), '') is not null
    ),
    published.published_at,
    coalesce(current_item.is_active, true)
  from public.price_list_published as published
  left join public.price_list_items as current_item
    on current_item.item_number = published.item_number
  order by published.item_number;
$$;

revoke all on function public.list_published_product_master() from public, anon, authenticated;
grant execute on function public.list_published_product_master() to anon, authenticated;


-- Preserve published content and prices for history, but reject future publication.
create function public.guard_active_product_publication()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.price_list_items where item_number = new.item_number and not is_active) then
    raise exception 'Product % is discontinued and cannot be published or edited as an active product.', new.item_number using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_active_product_publication() from public, anon, authenticated;
create trigger guard_active_price_publication before insert or update on public.price_list_published
for each row execute function public.guard_active_product_publication();
create trigger guard_active_marketing_product before insert or update on public.marketing_configurator_product_content
for each row execute function public.guard_active_product_publication();
