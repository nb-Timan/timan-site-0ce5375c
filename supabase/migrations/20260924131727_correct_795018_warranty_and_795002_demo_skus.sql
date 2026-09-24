-- Correct the two future Product Master identities without touching frozen
-- configuration, quote, order or PDF snapshots.
insert into public.price_list_items (
  item_number, item_text_da, item_text_de, item_text_en,
  price_dkk, price_eur, price_sek, is_dirty, last_published_at, updated_at
)
values
  ('795018', 'Udvidet komponentgaranti 3330', null, 'Timan 3330 extended component warranty (12 months)', 4950, 665, null, false, now(), now()),
  ('795002', 'Demo maskine', 'Demo-Maschine', 'Demo machine', 75, 10, null, false, now(), now())
on conflict (item_number) do update set
  item_text_da = excluded.item_text_da,
  item_text_de = case when excluded.item_number = '795018' then price_list_items.item_text_de else excluded.item_text_de end,
  item_text_en = excluded.item_text_en,
  price_dkk = excluded.price_dkk,
  price_eur = excluded.price_eur,
  is_dirty = false,
  last_published_at = excluded.last_published_at,
  updated_at = excluded.updated_at;

insert into public.price_list_published (
  item_number, item_text_da, item_text_de, item_text_en,
  price_dkk, price_eur, price_sek, identity_aliases, published_at
)
values
  (
    '795018',
    'Udvidet komponentgaranti 3330',
    null,
    'Timan 3330 extended component warranty (12 months)',
    4950, 665, null,
    array[
      'Timan 3330 udvidet komponentgaranti med 12 mdr.',
      'Timan 3330 extended component warranty (12 months)'
    ],
    now()
  ),
  (
    '795002',
    'Demo maskine',
    'Demo-Maschine',
    'Demo machine',
    75, 10, null,
    array['Demo Maskine', 'Demo-Maschine', 'Demo machine'],
    now()
  )
on conflict (item_number) do update set
  item_text_da = excluded.item_text_da,
  item_text_de = case when excluded.item_number = '795018' then price_list_published.item_text_de else excluded.item_text_de end,
  item_text_en = excluded.item_text_en,
  price_dkk = excluded.price_dkk,
  price_eur = excluded.price_eur,
  identity_aliases = excluded.identity_aliases,
  published_at = excluded.published_at;
