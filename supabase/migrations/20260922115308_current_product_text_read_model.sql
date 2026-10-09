-- Current localized product identity is live immediately after Backend save,
-- while prices remain sourced exclusively from the controlled published table.
create or replace function public.list_published_product_master()
returns table(
  item_number text,
  item_text_da text,
  item_text_de text,
  item_text_en text,
  price_dkk numeric,
  price_eur numeric,
  price_sek numeric,
  identity_aliases text[],
  published_at timestamptz
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
    published.published_at
  from public.price_list_published as published
  left join public.price_list_items as current_item
    on current_item.item_number = published.item_number
  order by published.item_number;
$$;

revoke all on function public.list_published_product_master() from public, anon, authenticated;
grant execute on function public.list_published_product_master() to anon, authenticated;
