-- The public Messe Configurator needs approved sell prices only. This
-- constrained RPC deliberately exposes no audit fields or cost prices.
create or replace function public.list_published_configurator_prices()
returns table (
  item_number text,
  price_dkk numeric,
  price_eur numeric,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    published.item_number,
    published.price_dkk,
    published.price_eur,
    published.published_at
  from public.price_list_published as published
  order by published.item_number;
$$;

revoke all on function public.list_published_configurator_prices() from public, anon, authenticated;
grant execute on function public.list_published_configurator_prices() to anon, authenticated;
