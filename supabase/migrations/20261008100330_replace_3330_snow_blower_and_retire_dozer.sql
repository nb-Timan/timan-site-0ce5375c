-- Keep discontinued Timan 3330 equipment available to historical snapshots,
-- while moving the current snow blower identity to the approved replacement.

insert into public.price_list_items (
  item_number, renamed_from_item_number,
  item_text_da, item_text_en, item_text_de,
  price_dkk, price_eur, price_sek,
  is_active, is_dirty, last_published_at
)
select
  '730016-00-SAM', '730106',
  coalesce(source.item_text_da, 'Sneslynge, 110 cm arbejdsbredde'),
  coalesce(source.item_text_en, 'Snow blower, 110 cm working width'),
  coalesce(source.item_text_de, 'Schneefräse, 110 cm Arbeitsbreite'),
  coalesce(source.price_dkk, 49500),
  coalesce(source.price_eur, 6665),
  source.price_sek,
  true, false, now()
from (
  select
    coalesce(draft.item_text_da, published.item_text_da) as item_text_da,
    coalesce(draft.item_text_en, published.item_text_en) as item_text_en,
    coalesce(draft.item_text_de, published.item_text_de) as item_text_de,
    coalesce(draft.price_dkk, published.price_dkk) as price_dkk,
    coalesce(draft.price_eur, published.price_eur) as price_eur,
    coalesce(draft.price_sek, published.price_sek) as price_sek
  from (select 1) seed
  left join public.price_list_items draft on draft.item_number = '730106'
  left join public.price_list_published published on published.item_number = '730106'
) source
on conflict (item_number) do nothing;

-- Existing canonical replacement values win. Only fill fields that are still
-- empty, using the old snow blower row and finally the approved static values.
update public.price_list_items replacement
set
  renamed_from_item_number = coalesce(replacement.renamed_from_item_number, '730106'),
  item_text_da = coalesce(replacement.item_text_da, source.item_text_da, 'Sneslynge, 110 cm arbejdsbredde'),
  item_text_en = coalesce(replacement.item_text_en, source.item_text_en, 'Snow blower, 110 cm working width'),
  item_text_de = coalesce(replacement.item_text_de, source.item_text_de, 'Schneefräse, 110 cm Arbeitsbreite'),
  price_dkk = coalesce(replacement.price_dkk, source.price_dkk, 49500),
  price_eur = coalesce(replacement.price_eur, source.price_eur, 6665),
  price_sek = coalesce(replacement.price_sek, source.price_sek),
  is_active = true,
  updated_at = now()
from (
  select
    coalesce(draft.item_text_da, published.item_text_da) as item_text_da,
    coalesce(draft.item_text_en, published.item_text_en) as item_text_en,
    coalesce(draft.item_text_de, published.item_text_de) as item_text_de,
    coalesce(draft.price_dkk, published.price_dkk) as price_dkk,
    coalesce(draft.price_eur, published.price_eur) as price_eur,
    coalesce(draft.price_sek, published.price_sek) as price_sek
  from (select 1) seed
  left join public.price_list_items draft on draft.item_number = '730106'
  left join public.price_list_published published on published.item_number = '730106'
) source
where replacement.item_number = '730016-00-SAM';

insert into public.price_list_items (
  item_number, item_text_da, item_text_en, item_text_de,
  price_dkk, price_eur, is_active, is_dirty
)
values
  ('730106', 'Sneslynge, 110 cm arbejdsbredde', 'Snow blower, 110 cm working width', 'Schneefräse, 110 cm Arbeitsbreite', 49500, 6665, false, false),
  ('730105', 'Dozerblad 130 cm med gummiskær', 'Dozer blade 130 cm with rubber edge', 'Räumschild 130 cm mit Gummischürfleiste', 19000, 2560, false, false)
on conflict (item_number) do update
set is_active = false, updated_at = now();

insert into public.price_list_published (
  item_number,
  item_text_da, item_text_en, item_text_de,
  price_dkk, price_eur, price_sek,
  identity_aliases, published_at
)
select
  item_number,
  item_text_da, item_text_en, item_text_de,
  price_dkk, price_eur, price_sek,
  array_remove(array[item_text_da, item_text_en, item_text_de], null),
  now()
from public.price_list_items
where item_number = '730016-00-SAM'
on conflict (item_number) do nothing;

update public.price_list_items
set is_dirty = false,
    last_published_at = coalesce(last_published_at, now())
where item_number = '730016-00-SAM';

-- Reassociate any existing current snow blower presentation without removing
-- the old row that historical material may still reference.
insert into public.marketing_configurator_product_content (
  product_key, machine_key, item_number, content, status,
  created_by, updated_by, published_at, created_at, updated_at
)
select
  old.machine_key || '::730016-00-SAM', old.machine_key, '730016-00-SAM',
  old.content, old.status, old.created_by, old.updated_by,
  old.published_at, old.created_at, old.updated_at
from public.marketing_configurator_product_content old
where old.item_number = '730106'
on conflict (product_key, status) do nothing;

-- Current clients need the inactive rows as blocking metadata even when those
-- historical products were never present in the published price table.
drop function if exists public.list_published_product_master();
create function public.list_published_product_master()
returns table(
  item_number text,
  item_text_da text,
  item_text_en text,
  item_text_de text,
  item_text_it text,
  item_text_hu text,
  item_text_sv text,
  item_text_fr text,
  item_text_pl text,
  item_text_cs text,
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
    case when current_item.item_number is not null then current_item.item_text_en else published.item_text_en end,
    case when current_item.item_number is not null then current_item.item_text_de else published.item_text_de end,
    case when current_item.item_number is not null then current_item.item_text_it else published.item_text_it end,
    case when current_item.item_number is not null then current_item.item_text_hu else published.item_text_hu end,
    case when current_item.item_number is not null then current_item.item_text_sv else published.item_text_sv end,
    case when current_item.item_number is not null then current_item.item_text_fr else published.item_text_fr end,
    case when current_item.item_number is not null then current_item.item_text_pl else published.item_text_pl end,
    case when current_item.item_number is not null then current_item.item_text_cs else published.item_text_cs end,
    published.price_dkk,
    published.price_eur,
    published.price_sek,
    array(
      select distinct alias
      from unnest(
        coalesce(published.identity_aliases, '{}'::text[])
        || array[
          published.item_text_da, published.item_text_en, published.item_text_de,
          published.item_text_it, published.item_text_hu, published.item_text_sv,
          published.item_text_fr, published.item_text_pl, published.item_text_cs,
          current_item.item_text_da, current_item.item_text_en, current_item.item_text_de,
          current_item.item_text_it, current_item.item_text_hu, current_item.item_text_sv,
          current_item.item_text_fr, current_item.item_text_pl, current_item.item_text_cs
        ]
      ) as alias
      where nullif(btrim(alias), '') is not null
    ),
    published.published_at,
    coalesce(current_item.is_active, true)
  from public.price_list_published published
  left join public.price_list_items current_item using (item_number)

  union all

  select
    current_item.item_number,
    current_item.item_text_da,
    current_item.item_text_en,
    current_item.item_text_de,
    current_item.item_text_it,
    current_item.item_text_hu,
    current_item.item_text_sv,
    current_item.item_text_fr,
    current_item.item_text_pl,
    current_item.item_text_cs,
    current_item.price_dkk,
    current_item.price_eur,
    current_item.price_sek,
    array(
      select distinct alias
      from unnest(array[
        current_item.item_text_da, current_item.item_text_en, current_item.item_text_de,
        current_item.item_text_it, current_item.item_text_hu, current_item.item_text_sv,
        current_item.item_text_fr, current_item.item_text_pl, current_item.item_text_cs
      ]) alias
      where nullif(btrim(alias), '') is not null
    ),
    current_item.last_published_at,
    false
  from public.price_list_items current_item
  where not current_item.is_active
    and not exists (
      select 1 from public.price_list_published published
      where published.item_number = current_item.item_number
    )
  order by item_number;
$$;

revoke all on function public.list_published_product_master() from public, anon, authenticated;
grant execute on function public.list_published_product_master() to anon, authenticated;
