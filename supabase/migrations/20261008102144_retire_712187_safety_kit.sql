-- Preserve SKU 712187 as a historical Product Master identity while excluding
-- it from every current assortment backed by is_active.
insert into public.price_list_items (
  item_number,
  item_text_da,
  item_text_en,
  item_text_de,
  item_text_it,
  item_text_hu,
  price_dkk,
  price_eur,
  is_active,
  is_dirty
)
values (
  '712187',
  'Sikkerhedskit førstehjælp og trekant.',
  'Safety kit: first aid and warning triangle',
  'Sicherheitskit: Erste Hilfe und Warndreieck',
  'Kit sicurezza: primo soccorso e triangolo',
  'Biztonsági készlet: elsősegély és elakadásjelző háromszög',
  1250,
  160,
  false,
  false
)
on conflict (item_number) do update
set is_active = false,
    updated_at = now();
