-- Canonical non-price Configurator hierarchy. Commercial text and prices stay
-- in Product Master; saved configurations continue to persist child SKUs.
create table if not exists public.configurator_product_relations (
  id uuid primary key default gen_random_uuid(),
  machine_type text not null,
  parent_item_number text not null,
  child_item_number text not null,
  relation_type text not null check (relation_type in ('variant', 'option')),
  selection_group text,
  variant_label_key text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (machine_type, parent_item_number, child_item_number)
);

alter table public.configurator_product_relations enable row level security;
revoke all on table public.configurator_product_relations from anon, authenticated;

comment on table public.configurator_product_relations is
  'Canonical Configurator grouping, variant and optional-child relations. No commercial prices are stored here.';

insert into public.price_list_items (
  item_number, item_text_da, item_text_en, item_text_de, item_text_it,
  item_text_hu, item_text_sv, item_text_fr, item_text_pl, item_text_cs,
  price_dkk, price_eur, price_sek, is_active, is_dirty
)
values
  ('720131', 'T2 Opsamlingstank med recirkulering', 'T2 collection tank with recirculation',
   'T2 Sammelbehälter mit Rezirkulation', 'Serbatoio di raccolta T2 con ricircolo',
   'T2 gyűjtőtartály recirkulációval', 'T2 uppsamlingstank med recirkulation',
   'Cuve de récupération T2 avec recirculation', 'Zbiornik zbiorczy T2 z recyrkulacją',
   'Sběrná nádrž T2 s recirkulací', null, null, null, true, false),
  ('331122', 'T3 Opsamlingstank med tørsug', 'T3 collection tank with dry vacuum',
   'T3 Sammelbehälter mit Trockensaugung', 'Serbatoio di raccolta T3 con aspirazione a secco',
   'T3 gyűjtőtartály száraz szívással', 'T3 uppsamlingstank med torrsug',
   'Cuve de récupération T3 avec aspiration à sec', 'Zbiornik zbiorczy T3 z odsysaniem na sucho',
   'Sběrná nádrž T3 se suchým odsáváním', null, null, null, true, false),
  ('720125', 'T2 Opsamlingstank uden højtryksslange', 'T2 collection tank without pressure washer hose',
   'T2 Sammelbehälter ohne Hochdruckschlauch', 'Serbatoio di raccolta T2 senza tubo alta pressione',
   'T2 gyűjtőtartály magasnyomású tömlő nélkül', 'T2 uppsamlingstank utan högtrycksslang',
   'Cuve de récupération T2 sans flexible haute pression', 'Zbiornik zbiorczy T2 bez węża wysokociśnieniowego',
   'Sběrná nádrž T2 bez vysokotlaké hadice', 94860, 12770, null, true, false),
  ('720130', 'T2 Opsamlingstank inkl. højtryksrenser', 'T2 collection tank incl. pressure washer',
   'T2 Sammelbehälter inkl. Hochdruckreiniger', 'Serbatoio di raccolta T2 incl. idropulitrice',
   'T2 gyűjtőtartály magasnyomású mosóval', 'T2 uppsamlingstank inkl. högtryckstvätt',
   'Cuve de récupération T2 avec nettoyeur haute pression', 'Zbiornik zbiorczy T2 z myjką ciśnieniową',
   'Sběrná nádrž T2 včetně vysokotlakého čističe', 107800, 14510, null, true, false),
  ('720132', 'T3 Opsamlingstank med tørsug', 'T3 collection tank with dry vacuum',
   'T3 Sammelbehälter mit Trockensaugung', 'Serbatoio di raccolta T3 con aspirazione a secco',
   'T3 gyűjtőtartály száraz szívással', 'T3 uppsamlingstank med torrsug',
   'Cuve de récupération T3 avec aspiration à sec', 'Zbiornik zbiorczy T3 z odsysaniem na sucho',
   'Sběrná nádrž T3 se suchým odsáváním', 84860, 10370, null, true, false),
  ('720133', 'T3 Opsamlingstank med tørsug og højtryksrenser', 'T3 collection tank with dry vacuum and pressure washer',
   'T3 Sammelbehälter mit Trockensaugung und Hochdruckreiniger', 'Serbatoio di raccolta T3 con aspirazione a secco e idropulitrice',
   'T3 gyűjtőtartály száraz szívással és magasnyomású mosóval', 'T3 uppsamlingstank med torrsug och högtryckstvätt',
   'Cuve de récupération T3 avec aspiration à sec et nettoyeur haute pression', 'Zbiornik zbiorczy T3 z odsysaniem na sucho i myjką ciśnieniową',
   'Sběrná nádrž T3 se suchým odsáváním a vysokotlakým čističem', 97860, 11440, null, true, false),
  ('721122', 'Fabriksmontering af centerslange for fejesug T2 og T3', 'Factory installation of center hose for sweep/vac T2 and T3',
   'Werksmontage Zentralschlauch für Kehr/Saug T2 und T3', 'Installazione in fabbrica del tubo centrale per spazzatura/aspirazione T2 e T3',
   'Központi tömlő gyári beszerelése T2/T3 seprés/szíváshoz', 'Fabriksmontering av centerslang för sop-/sugenhet T2 och T3',
   'Montage en usine du flexible central pour balayeuse-aspiratrice T2 et T3', 'Montaż fabryczny węża centralnego do zamiatarko-odkurzacza T2 i T3',
   'Tovární montáž středové hadice pro zametací/sací jednotku T2 a T3', 3100, 420, null, true, false),
  ('V34-029', 'Vogn for afmontering af redskaber bag', 'Trolley for removing rear implements',
   'Wagen zum Abmontieren von Heckgeräten', 'Carrello per smontaggio attrezzi posteriori',
   'Kocsi a hátsó eszközök leszereléséhez', 'Vagn för demontering av bakre redskap',
   'Chariot pour le démontage des outils arrière', 'Wózek do demontażu osprzętu tylnego',
   'Vozík pro demontáž zadního nářadí', 6600, 890, null, true, false)
on conflict (item_number) do nothing;

insert into public.price_list_published (
  item_number, item_text_da, item_text_en, item_text_de, item_text_it,
  item_text_hu, item_text_sv, item_text_fr, item_text_pl, item_text_cs,
  price_dkk, price_eur, price_sek
)
select
  item_number, item_text_da, item_text_en, item_text_de, item_text_it,
  item_text_hu, item_text_sv, item_text_fr, item_text_pl, item_text_cs,
  price_dkk, price_eur, price_sek
from public.price_list_items
where item_number in ('720131', '331122', '720125', '720130', '720132', '720133', '721122', 'V34-029')
on conflict (item_number) do nothing;

insert into public.configurator_product_relations (
  machine_type, parent_item_number, child_item_number, relation_type,
  selection_group, variant_label_key, sort_order
)
values
  ('Timan 3330', '720131', '720125', 'variant', 'collection_tank_t2', 'variantWithoutPressureHose', 10),
  ('Timan 3330', '720131', '720130', 'variant', 'collection_tank_t2', 'variantWithPressureHose', 20),
  ('Timan 3330', '720125', '721122', 'option', null, null, 10),
  ('Timan 3330', '720125', 'V34-029', 'option', null, null, 20),
  ('Timan 3330', '720130', '721122', 'option', null, null, 10),
  ('Timan 3330', '720130', 'V34-029', 'option', null, null, 20),
  ('Timan 3330', '331122', '720132', 'variant', 'collection_tank_t3', 'variantWithoutPressureHose', 10),
  ('Timan 3330', '331122', '720133', 'variant', 'collection_tank_t3', 'variantWithPressureHose', 20),
  ('Timan 3330', '720132', '721122', 'option', null, null, 10),
  ('Timan 3330', '720132', 'V34-029', 'option', null, null, 20),
  ('Timan 3330', '720133', '721122', 'option', null, null, 10),
  ('Timan 3330', '720133', 'V34-029', 'option', null, null, 20)
on conflict (machine_type, parent_item_number, child_item_number) do update
set relation_type = excluded.relation_type,
    selection_group = excluded.selection_group,
    variant_label_key = excluded.variant_label_key,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();

create or replace function public.list_published_configurator_product_relations()
returns table (
  machine_type text,
  parent_item_number text,
  child_item_number text,
  relation_type text,
  selection_group text,
  variant_label_key text,
  sort_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    relation.machine_type,
    relation.parent_item_number,
    relation.child_item_number,
    relation.relation_type,
    relation.selection_group,
    relation.variant_label_key,
    relation.sort_order
  from public.configurator_product_relations as relation
  where relation.is_active
  order by relation.machine_type, relation.parent_item_number, relation.sort_order, relation.child_item_number;
$$;

revoke all on function public.list_published_configurator_product_relations() from public, anon, authenticated;
grant execute on function public.list_published_configurator_product_relations() to anon, authenticated;
