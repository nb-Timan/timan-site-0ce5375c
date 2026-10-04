-- The Configurator stores accessory IDs, which are not always item numbers.
-- Keep this identifier-only snapshot in sync with src/data/machines.ts.
-- Generated rows can be refreshed with scripts/generatePlanningAccessoryRows.ts.
create table public.planning_accessory_products (
  machine_key text not null,
  accessory_id text not null,
  item_number text not null,
  is_quantity_input boolean not null,
  primary key (machine_key, accessory_id)
);
create index planning_accessory_products_item_idx
  on public.planning_accessory_products (item_number);
alter table public.planning_accessory_products enable row level security;
create policy planning_accessory_products_read on public.planning_accessory_products
  for select to authenticated using ((select public.can_access_planning()));
revoke all on public.planning_accessory_products from public, anon, authenticated;
grant select on public.planning_accessory_products to authenticated;
grant all on public.planning_accessory_products to service_role;

insert into public.planning_accessory_products
  (machine_key, accessory_id, item_number, is_quantity_input) values
  ('RC-751', '411687', '411687', false),
  ('RC-751', '410106', '410106', false),
  ('RC-751', '411571', '411571', false),
  ('RC-751', '411866', '411866', false),
  ('RC-751', '411867', '411867', false),
  ('RC-751', '795015', '795015', false),
  ('RC-1000S', '13101003', '13101003', false),
  ('RC-1000S', '13101005', '13101005', false),
  ('RC-1000S', '412594', '412594', false),
  ('RC-1000S', '411630', '411630', false),
  ('RC-1000S', '795016', '795016', false),
  ('RC-1000S', '410910', '410910', false),
  ('RC-1000S', '411701', '411701', false),
  ('RC-1000S', '412585', '412585', false),
  ('RC-1000S', '411594', '411594', false),
  ('RC-1000S', '411666', '411666', false),
  ('RC-1000S', '411800', '411800', false),
  ('RC-1000S', '412040', '412040', false),
  ('RC-1000S', 'HFS-1012', 'HFS-1012', false),
  ('RC-1000S', '411742', '411742', false),
  ('RC-1000S', '730276', '730276', false),
  ('RC-1000S', '712901', '712901', false),
  ('RC-1000S', '412051', '412051', false),
  ('RC-1000S', '411845', '411845', false),
  ('RC-1000S', '712900', '712900', false),
  ('RC-1000S', '418000', '418000', false),
  ('RC-1000S', '730600', '730600', false),
  ('RC-1000S', '412603', '412603', false),
  ('RC-1000S', '50101017', '50101017', true),
  ('RC-1000S', '50101018', '50101018', true),
  ('RC-1000S', '50101019', '50101019', true),
  ('RC-1000S', '50101020', '50101020', true),
  ('RC-1000S', '412050', '412050', false),
  ('RC-1000S', '412614', '412614', false),
  ('RC-1000S', '411891', '411891', false),
  ('RC-1000S', '411906', '411906', false),
  ('RC-1000S', '961050', '961050', false),
  ('Timan 3330', '712050', '712050', false),
  ('Timan 3330', '712060', '712060', false),
  ('Timan 3330', '712146', '712146', false),
  ('Timan 3330', '712147', '712147', false),
  ('Timan 3330', '712141', '712141', false),
  ('Timan 3330', '712140', '712140', false),
  ('Timan 3330', '712142', '712142', false),
  ('Timan 3330', '712143', '712143', false),
  ('Timan 3330', '712145', '712145', false),
  ('Timan 3330', '712145__712578', '712578', false),
  ('Timan 3330', '712164', '712164', false),
  ('Timan 3330', '712168', '712168', false),
  ('Timan 3330', '712166', '712166', false),
  ('Timan 3330', '712167', '712167', false),
  ('Timan 3330', '712178', '712178', false),
  ('Timan 3330', '712179', '712179', false),
  ('Timan 3330', '712175', '712175', false),
  ('Timan 3330', 'V34-165', 'V34-165', false),
  ('Timan 3330', '712180', '712180', false),
  ('Timan 3330', '712176', '712176', false),
  ('Timan 3330', '712187', '712187', false),
  ('Timan 3330', '712169', '712169', false),
  ('Timan 3330', '712188', '712188', false),
  ('Timan 3330', '712527', '712527', false),
  ('Timan 3330', '712528', '712528', false),
  ('Timan 3330', 'S900025', 'S900025', false),
  ('Timan 3330', '712174', '712174', false),
  ('Timan 3330', '720125', '720125', false),
  ('Timan 3330', '721122_720125', '721122', false),
  ('Timan 3330', 'V34-029_720125', 'V34-029', false),
  ('Timan 3330', '720130', '720130', false),
  ('Timan 3330', '721122_720130', '721122', false),
  ('Timan 3330', 'V34-029_720130', 'V34-029', false),
  ('Timan 3330', '720132', '720132', false),
  ('Timan 3330', '721122_720132', '721122', false),
  ('Timan 3330', 'V34-029_720132', 'V34-029', false),
  ('Timan 3330', '720133', '720133', false),
  ('Timan 3330', '721122_720133', '721122', false),
  ('Timan 3330', 'V34-029_720133', 'V34-029', false),
  ('Timan 3330', '730030', '730030', false),
  ('Timan 3330', '720121', '720121', true),
  ('Timan 3330', '720599', '720599', true),
  ('Timan 3330', '720485', '720485', true),
  ('Timan 3330', '720617', '720617', true),
  ('Timan 3330', '730600_3330', '730600', false),
  ('Timan 3330', '730601_3330', '730601', false),
  ('Timan 3330', '50101017_3330', '50101017', true),
  ('Timan 3330', '50101018_3330', '50101018', true),
  ('Timan 3330', '50101019_3330', '50101019', true),
  ('Timan 3330', '50101020_3330', '50101020', true),
  ('Timan 3330', '730017', '730017', false),
  ('Timan 3330', 'HGM-2007', 'HGM-2007', false),
  ('Timan 3330', '730130', '730130', false),
  ('Timan 3330', '730020', '730020', false),
  ('Timan 3330', 'LT_712900', '712900', false),
  ('Timan 3330', '730114', '730114', false),
  ('Timan 3330', 'LT_712901', '712901', false),
  ('Timan 3330', 'LT_730276', '730276', false),
  ('Timan 3330', '730105', '730105', false),
  ('Timan 3330', '730036', '730036', false),
  ('Timan 3330', '730106', '730106', false),
  ('Timan 3330', '725131', '725131', false),
  ('Timan 3330', '725131__712902', '712902', false),
  ('Timan 3330', '725131__725120', '725120', false),
  ('Timan 3330', '725131__725121', '725121', false),
  ('Timan 3330', '725131__V34-029', 'V34-029', false),
  ('Timan 3330', '725131__V34-055', 'V34-055', false),
  ('Timan 3330', '725131__V34-055__712903', '712903', false),
  ('Timan 3330', '725131__V34-055__725126', '725126', false),
  ('Timan 3330', '725132', '725132', false),
  ('Timan 3330', '725132__712902', '712902', false),
  ('Timan 3330', '725132__725120', '725120', false),
  ('Timan 3330', '725132__V34-029', 'V34-029', false),
  ('Timan 3330', '725132__725121', '725121', false),
  ('Timan 3330', '725132__V34-055', 'V34-055', false),
  ('Timan 3330', '725132__V34-055__712903', '712903', false),
  ('Timan 3330', '725132__V34-055__725126', '725126', false),
  ('Timan 3330', '725138', '725138', false),
  ('Timan 3330', '725138__712902', '712902', false),
  ('Timan 3330', '725138__725120', '725120', false),
  ('Timan 3330', '725138__V34-029', 'V34-029', false),
  ('Timan 3330', '725138__V34-055', 'V34-055', false),
  ('Timan 3330', '725138__V34-055__712903', '712903', false),
  ('Timan 3330', '725138__V34-055__725126', '725126', false),
  ('Timan 3330', 'HGM-20083', 'HGM-20083', false),
  ('Timan 3330', 'HGM-20083__730034', '730034', false),
  ('Timan 3330', 'HGM-20083__730033', '730033', false),
  ('Timan 3330', 'HGM-20082', 'HGM-20082', false),
  ('Timan 3330', 'HGM-20082__730033', '730033', false),
  ('Timan 3330', '730107', '730107', false),
  ('Timan 3330', '730035', '730035', false),
  ('Timan 3330', 'V35-502', 'V35-502', false),
  ('Timan 3330', 'V35-300', 'V35-300', false),
  ('Timan 3330', '721122_standalone', '721122', false),
  ('Timan 3330', 'V34-029_standalone', 'V34-029', false),
  ('Timan 3330', 'V34-055_standalone', 'V34-055', false),
  ('Timan 3330', 'V34-055__712903', '712903', false),
  ('Timan 3330', 'V34-055__725126', '725126', false),
  ('Timan 3330', '795018', '795018', false),
  ('Timan 2620', '2620_NO_CAB', '999-888-U', false),
  ('Timan 2620', '8000-01', '8000-01', false),
  ('Timan 2620', '8000-02', '8000-02', false),
  ('Timan 2620', '8000-03', '8000-03', false),
  ('Timan 2620', '8000-04', '8000-04', false),
  ('Timan 2620', '8000-05', '8000-05', false),
  ('Timan 2620', '8000-06', '8000-06', false),
  ('Timan 2620', '8000-07', '8000-07', false),
  ('Timan 2620', '8000-08', '8000-08', false),
  ('Timan 2620', '8000-09', '8000-09', false),
  ('Timan 2620', '8000-10', '8000-10', false),
  ('Timan 2620', '8000-11', '8000-11', false),
  ('Timan 2620', '8000-12', '8000-12', false),
  ('Timan 2620', '9000-01', '9000-01', false),
  ('Timan 2620', '9000-02', '9000-02', false),
  ('Timan 2620', '9000-03', '9000-03', false),
  ('Timan 2620', '9000-04', '9000-04', false),
  ('Timan 2620', '9000-05', '9000-05', false),
  ('Timan 2620', '9000-06', '9000-06', false),
  ('Timan 2620', '9000-07', '9000-07', false),
  ('Timan 2620', '9000-08', '9000-08', false),
  ('Timan 2620', '9000-09', '9000-09', false),
  ('Timan 2620', '9000-10', '9000-10', false),
  ('Timan 2620', '9000-11', '9000-11', false),
  ('Timan 2620', '9000-12', '9000-12', false),
  ('Timan 2620', '9000-13', '9000-13', false),
  ('Timan 2620', '1000-01', '1000-01', false),
  ('Timan 2620', '1000-02', '1000-02', false),
  ('Timan 2620', '1000-03', '1000-03', false),
  ('Timan 2620', '1000-04', '1000-04', false),
  ('Timan 2620', '1000-05', '1000-05', false),
  ('Timan 2620', '1000-06', '1000-06', false),
  ('Timan 2620', '1000-07', '1000-07', false),
  ('Timan 2620', '1000-08', '1000-08', false),
  ('Timan 2620', '2000-01', '2000-01', false),
  ('Timan 2620', '2000-02', '2000-02', false),
  ('Timan 2620', '2000-03', '2000-03', false),
  ('Timan 2620', '2000-04', '2000-04', false),
  ('Timan 2620', '2000-05', '2000-05', false),
  ('Timan 2620', '2000-06', '2000-06', false),
  ('Timan 2620', '2000-07', '2000-07', false),
  ('Timan 2620', '2000-08', '2000-08', false),
  ('Timan 2620', '2000-09', '2000-09', false),
  ('Timan 2620', '2000-10', '2000-10', false),
  ('Timan 2620', '2000-11', '2000-11', false),
  ('Timan 2620', '2000-12', '2000-12', false),
  ('Timan 2620', '2000-13', '2000-13', false),
  ('Timan 2620', '2000-14', '2000-14', false),
  ('Timan 2620', '2000-15', '2000-15', false),
  ('Timan 2620', '2000-16', '2000-16', false),
  ('Timan 2620', '2000-17', '2000-17', false),
  ('Timan 2620', '2000-18', '2000-18', false),
  ('Timan 2620', '2000-19', '2000-19', false),
  ('Timan 2620', '2000-20', '2000-20', false),
  ('Timan 2620', '3000-01', '744000', false),
  ('Timan 2620', '3000-01__774005', '774005', false),
  ('Timan 2620', '3000-02', '3000-02', false),
  ('Timan 2620', '3000-03', '3000-03', false),
  ('Timan 2620', '3000-04', '3000-04', false),
  ('Timan 2620', '3000-05', '770003', false),
  ('Timan 2620', '3000-06', '770002', false),
  ('Timan 2620', '3000-07', '3000-07', false),
  ('Timan 2620', '3000-08', '3000-08', false),
  ('Timan 2620', '3000-09', '3000-09', false),
  ('Timan 2620', '4000-01', '770007', false),
  ('Timan 2620', '4000-02', '4000-02', false),
  ('Timan 2620', '4000-03', '4000-03', false),
  ('Timan 2620', '4000-04', '4000-04', false),
  ('Timan 2620', '4000-05', '4000-05', false),
  ('Timan 2620', '5000-01', '5000-01', false),
  ('LOOSE_TOOL', '410910', '410910', false),
  ('LOOSE_TOOL', '411701', '411701', false),
  ('LOOSE_TOOL', '412585', '412585', false),
  ('LOOSE_TOOL', '411594', '411594', false),
  ('LOOSE_TOOL', '411666', '411666', false),
  ('LOOSE_TOOL', '411800', '411800', false),
  ('LOOSE_TOOL', '412040', '412040', false),
  ('LOOSE_TOOL', 'HFS-1012', 'HFS-1012', false),
  ('LOOSE_TOOL', '411742', '411742', false),
  ('LOOSE_TOOL', '730276', '730276', false),
  ('LOOSE_TOOL', '712901', '712901', false),
  ('LOOSE_TOOL', '412051', '412051', false),
  ('LOOSE_TOOL', '411845', '411845', false),
  ('LOOSE_TOOL', '712900', '712900', false),
  ('LOOSE_TOOL', '418000', '418000', false),
  ('LOOSE_TOOL', '730600', '730600', false),
  ('LOOSE_TOOL', '412603', '412603', false),
  ('LOOSE_TOOL', '50101017', '50101017', true),
  ('LOOSE_TOOL', '50101018', '50101018', true),
  ('LOOSE_TOOL', '50101019', '50101019', true),
  ('LOOSE_TOOL', '50101020', '50101020', true),
  ('LOOSE_TOOL', '412050', '412050', false),
  ('LOOSE_TOOL', '412614', '412614', false),
  ('LOOSE_TOOL', '411891', '411891', false),
  ('LOOSE_TOOL', '411906', '411906', false),
  ('LOOSE_TOOL', '720125', '720125', false),
  ('LOOSE_TOOL', '721059_720125', '721059', false),
  ('LOOSE_TOOL', 'V34-029_720125', 'V34-029', false),
  ('LOOSE_TOOL', '720130', '720130', false),
  ('LOOSE_TOOL', '721059_720130', '721059', false),
  ('LOOSE_TOOL', 'V34-029_720130', 'V34-029', false),
  ('LOOSE_TOOL', '720132', '720132', false),
  ('LOOSE_TOOL', '721059_720132', '721059', false),
  ('LOOSE_TOOL', 'V34-029_720132', 'V34-029', false),
  ('LOOSE_TOOL', '720133', '720133', false),
  ('LOOSE_TOOL', '721059_720133', '721059', false),
  ('LOOSE_TOOL', 'V34-029_720133', 'V34-029', false),
  ('LOOSE_TOOL', '730030', '730030', false),
  ('LOOSE_TOOL', '720121', '720121', true),
  ('LOOSE_TOOL', '720599', '720599', true),
  ('LOOSE_TOOL', '720485', '720485', true),
  ('LOOSE_TOOL', '720617', '720617', true),
  ('LOOSE_TOOL', 'LT3330_730600_3330', '730600', false),
  ('LOOSE_TOOL', 'LT3330_730601_3330', '730601', false),
  ('LOOSE_TOOL', 'LT3330_50101017_3330', '50101017', true),
  ('LOOSE_TOOL', 'LT3330_50101018_3330', '50101018', true),
  ('LOOSE_TOOL', 'LT3330_50101019_3330', '50101019', true),
  ('LOOSE_TOOL', 'LT3330_50101020_3330', '50101020', true),
  ('LOOSE_TOOL', '730017', '730017', false),
  ('LOOSE_TOOL', 'HGM-2007', 'HGM-2007', false),
  ('LOOSE_TOOL', '730130', '730130', false),
  ('LOOSE_TOOL', '730020', '730020', false),
  ('LOOSE_TOOL', 'LT_712900', '712900', false),
  ('LOOSE_TOOL', '730114', '730114', false),
  ('LOOSE_TOOL', 'LT_712901', '712901', false),
  ('LOOSE_TOOL', 'LT_730276', '730276', false),
  ('LOOSE_TOOL', '730105', '730105', false),
  ('LOOSE_TOOL', '730036', '730036', false),
  ('LOOSE_TOOL', '730106', '730106', false),
  ('LOOSE_TOOL', '725131', '725131', false),
  ('LOOSE_TOOL', '725131__712902', '712902', false),
  ('LOOSE_TOOL', '725131__725120', '725120', false),
  ('LOOSE_TOOL', '725131__725121', '725121', false),
  ('LOOSE_TOOL', '725131__V34-029', 'V34-029', false),
  ('LOOSE_TOOL', '725131__V34-055', 'V34-055', false),
  ('LOOSE_TOOL', '725131__V34-055__712903', '712903', false),
  ('LOOSE_TOOL', '725131__V34-055__725126', '725126', false),
  ('LOOSE_TOOL', '725132', '725132', false),
  ('LOOSE_TOOL', '725132__712902', '712902', false),
  ('LOOSE_TOOL', '725132__725120', '725120', false),
  ('LOOSE_TOOL', '725132__V34-029', 'V34-029', false),
  ('LOOSE_TOOL', '725132__725121', '725121', false),
  ('LOOSE_TOOL', '725132__V34-055', 'V34-055', false),
  ('LOOSE_TOOL', '725132__V34-055__712903', '712903', false),
  ('LOOSE_TOOL', '725132__V34-055__725126', '725126', false),
  ('LOOSE_TOOL', '725138', '725138', false),
  ('LOOSE_TOOL', '725138__712902', '712902', false),
  ('LOOSE_TOOL', '725138__725120', '725120', false),
  ('LOOSE_TOOL', '725138__V34-029', 'V34-029', false),
  ('LOOSE_TOOL', '725138__V34-055', 'V34-055', false),
  ('LOOSE_TOOL', '725138__V34-055__712903', '712903', false),
  ('LOOSE_TOOL', '725138__V34-055__725126', '725126', false),
  ('LOOSE_TOOL', 'HGM-20083', 'HGM-20083', false),
  ('LOOSE_TOOL', 'HGM-20083__730034', '730034', false),
  ('LOOSE_TOOL', 'HGM-20083__730033', '730033', false),
  ('LOOSE_TOOL', 'HGM-20082', 'HGM-20082', false),
  ('LOOSE_TOOL', 'HGM-20082__730033', '730033', false),
  ('LOOSE_TOOL', 'LOES-HGM-20083', 'HGM-20083', false),
  ('LOOSE_TOOL', 'LOES-HGM-20082', 'HGM-20082', false),
  ('LOOSE_TOOL', 'LOES-730033', '730033', false),
  ('LOOSE_TOOL', 'LOES-730034', '730034', false),
  ('LOOSE_TOOL', '730107', '730107', false),
  ('LOOSE_TOOL', '730035', '730035', false),
  ('LOOSE_TOOL', 'V35-502', 'V35-502', false),
  ('LOOSE_TOOL', 'V35-300', 'V35-300', false),
  ('LOOSE_TOOL', 'V34-029_standalone', 'V34-029', false),
  ('LOOSE_TOOL', 'V34-055_standalone', 'V34-055', false),
  ('LOOSE_TOOL', 'V34-055__712903', '712903', false),
  ('LOOSE_TOOL', 'V34-055__725126', '725126', false),
  ('LOOSE_TOOL', '795018', '795018', false),
  ('LOOSE_TOOL', '721059', '721059', false),
  ('LOOSE_TOOL', '3000-01', '744000', false),
  ('LOOSE_TOOL', '3000-01__774005', '774005', false),
  ('LOOSE_TOOL', '3000-02', '3000-02', false),
  ('LOOSE_TOOL', '3000-03', '3000-03', false),
  ('LOOSE_TOOL', '3000-04', '3000-04', false),
  ('LOOSE_TOOL', '3000-05', '770003', false),
  ('LOOSE_TOOL', '3000-06', '770002', false),
  ('LOOSE_TOOL', '3000-07', '3000-07', false),
  ('LOOSE_TOOL', '3000-08', '3000-08', false),
  ('LOOSE_TOOL', '3000-09', '3000-09', false),
  ('LOOSE_TOOL', '4000-01', '770007', false),
  ('LOOSE_TOOL', '4000-02', '4000-02', false),
  ('LOOSE_TOOL', '4000-03', '4000-03', false),
  ('LOOSE_TOOL', '4000-04', '4000-04', false),
  ('LOOSE_TOOL', '4000-05', '4000-05', false),
  ('LOOSE_TOOL', '5000-01', '5000-01', false),
  ('LOOSE_TOOL', '725789', '725789', false);

create or replace function public.planning_selected_accessory_quantity(
  p_state jsonb, p_demand_key text, p_item_number text, p_accessory_id text default null
)
returns integer language sql stable security definer set search_path = ''
as $$
  with configured_unit as (
    select m.value as machine,
      case when m.value ->> 'configMode' = 'shared'
        then m.value ->> 'id' else p_demand_key end as config_key,
      case when m.value ->> 'configMode' = 'shared'
        then m.value -> 'acc'
        else p_state -> 'individualUnitConfigs' -> p_demand_key -> 'acc' end as selected_acc
    from pg_catalog.jsonb_array_elements(coalesce(p_state -> 'machineConfigs', '[]'::jsonb)) m(value)
    cross join lateral pg_catalog.generate_series(
      1, least(100, greatest(1, case when m.value ->> 'qty' ~ '^[0-9]{1,3}$'
        then (m.value ->> 'qty')::integer else 1 end))
    ) unit_no
    where p_demand_key = (m.value ->> 'id') || '_' || unit_no::text
  )
  select coalesce(sum(
    case when ap.is_quantity_input then
      case when coalesce(p_state -> 'accQty' ->> (u.config_key || '_' || ap.accessory_id), '') ~ '^[0-9]{1,3}$'
        then least(99, (p_state -> 'accQty' ->> (u.config_key || '_' || ap.accessory_id))::integer)
        else 0 end
    else case when coalesce(u.selected_acc, '[]'::jsonb) ? ap.accessory_id then 1 else 0 end
    end
  ), 0)::integer
  from configured_unit u
  join public.planning_accessory_products ap on ap.machine_key = u.machine ->> 'type'
  where ap.item_number = p_item_number
    and (p_accessory_id is null or ap.accessory_id = p_accessory_id);
$$;
revoke all on function public.planning_selected_accessory_quantity(jsonb,text,text,text)
  from public, anon, authenticated;

create or replace function public.planning_request_delivery(
  p_configuration_id uuid, p_demand_key text, p_item_number text,
  p_requested_date date, p_note text
)
returns public.planning_delivery_requests
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor public.app_users%rowtype;
  v_config public.configurations%rowtype;
  v_request public.planning_delivery_requests%rowtype;
begin
  if not public.can_manage_planning() then
    raise exception using errcode = '42501', message = 'PLANNING_ACCESS_DENIED';
  end if;
  select * into v_actor from public.app_users where auth_user_id = auth.uid() limit 1;
  select * into v_config from public.configurations where id = p_configuration_id;
  if not found or not public.planning_can_view_configuration(p_configuration_id) then
    raise exception using errcode = '42501', message = 'PLANNING_CONFIGURATION_OUTSIDE_SCOPE';
  end if;
  if nullif(btrim(coalesce(p_demand_key, '')), '') is null
    or nullif(btrim(coalesce(p_item_number, '')), '') is null then
    raise exception using errcode = '23514', message = 'PLANNING_INVALID_DEMAND';
  end if;
  if not exists (
    select 1 from pg_catalog.jsonb_array_elements(
      coalesce(v_config.state_json -> 'machineConfigs', '[]'::jsonb)) m(value)
    cross join lateral pg_catalog.generate_series(
      1, least(100, greatest(1, case when m.value ->> 'qty' ~ '^[0-9]{1,3}$'
        then (m.value ->> 'qty')::integer else 1 end))
    ) unit_no
    join public.planning_machine_products mp on mp.machine_key = m.value ->> 'type'
    where p_demand_key = (m.value ->> 'id') || '_' || unit_no::text
      and mp.item_number = p_item_number
  ) and public.planning_selected_accessory_quantity(
    v_config.state_json, p_demand_key, p_item_number) = 0 then
    raise exception using errcode = '23514', message = 'PLANNING_ITEM_NOT_IN_CONFIGURATION';
  end if;
  insert into public.planning_delivery_requests
    (configuration_id, demand_key, item_number, requested_delivery_date, note, requested_by)
    values (p_configuration_id, p_demand_key, p_item_number, p_requested_date,
      nullif(btrim(p_note), ''), v_actor.id)
    on conflict (configuration_id, demand_key, item_number) where request_status = 'open'
    do nothing returning * into v_request;
  if not found then
    select * into v_request from public.planning_delivery_requests
      where configuration_id = p_configuration_id and demand_key = p_demand_key
        and item_number = p_item_number and request_status = 'open';
    return v_request;
  end if;
  insert into public.planning_events
    (configuration_id, event_type, actor_user_id, reason)
    values (p_configuration_id, 'delivery_requested', v_actor.id, nullif(btrim(p_note), ''));
  return v_request;
end;
$$;
revoke all on function public.planning_request_delivery(uuid,text,text,date,text) from public, anon;
grant execute on function public.planning_request_delivery(uuid,text,text,date,text) to authenticated;

-- Each quantity demand is one physical piece. Multiple rows can use one lot,
-- while separate demand keys let a requested quantity span several lots.
create or replace function public.planning_pick_lot(
  p_item_number text, p_requested_date date
)
returns uuid language sql stable security definer set search_path = ''
as $$
  select l.id
  from public.planning_supply_lots l
  join public.planning_supply_sources s on s.source_system = l.source_system
  left join lateral (
    select count(*)::integer as allocated
    from public.planning_reservations r
    where r.supply_lot_id = l.id and r.status = 'active'
  ) occupied on true
  where l.item_number = p_item_number
    and l.quantity > occupied.allocated
    and l.supply_status in ('available', 'incoming', 'in_production')
    and (l.supply_status = 'available' or l.available_at is not null)
    and s.connected and s.last_synced_at is not null
    and s.last_synced_at <= now()
    and s.last_synced_at + s.freshness_limit_hours * interval '1 hour' >= now()
  order by
    case when coalesce(l.available_at,
      case when l.supply_status = 'available' then current_date end)
      <= coalesce(p_requested_date, current_date) then 0 else 1 end,
    case when coalesce(l.available_at, current_date) <= coalesce(p_requested_date, current_date)
      then coalesce(l.available_at, current_date) end desc nulls last,
    case when coalesce(l.available_at, current_date) > coalesce(p_requested_date, current_date)
      then l.available_at end asc nulls last,
    l.source_updated_at, l.id
  limit 1;
$$;
revoke all on function public.planning_pick_lot(text,date) from public, anon, authenticated;

create or replace function public.planning_reflow_quantity(p_item_number text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_row record;
  v_lot uuid;
begin
  insert into public.planning_events
    (reservation_id, configuration_id, event_type, reason)
  select id, configuration_id, 'soft_quantity_reflow_release', 'Automatic best-fit reflow'
  from public.planning_reservations
  where item_number = p_item_number and item_kind = 'quantity'
    and status = 'active' and reservation_type = 'soft_quote'
    and supply_lot_id is not null;

  update public.planning_reservations
  set supply_lot_id = null, assigned_at = null, updated_at = now()
  where item_number = p_item_number and item_kind = 'quantity'
    and status = 'active' and reservation_type = 'soft_quote';

  for v_row in
    select id, configuration_id, requested_delivery_date
    from public.planning_reservations
    where item_number = p_item_number and item_kind = 'quantity'
      and status = 'active' and reservation_type = 'soft_quote'
    order by requested_delivery_date nulls first, created_at, id
  loop
    v_lot := public.planning_pick_lot(p_item_number, v_row.requested_delivery_date);
    if v_lot is not null then
      update public.planning_reservations
      set supply_lot_id = v_lot, assigned_at = now(), updated_at = now()
      where id = v_row.id;
      insert into public.planning_events
        (reservation_id, configuration_id, event_type, reason)
      values (v_row.id, v_row.configuration_id, 'soft_quantity_reflow_assign',
        'Automatic best-fit reflow');
    end if;
  end loop;
end;
$$;
revoke all on function public.planning_reflow_quantity(text) from public, anon, authenticated;

create or replace function public.planning_reserve_quantity(
  p_configuration_id uuid, p_demand_key text, p_item_number text,
  p_requested_date date, p_kind text
)
returns public.planning_reservations
language plpgsql security definer set search_path = ''
as $$
declare
  v_config public.configurations%rowtype;
  v_actor public.app_users%rowtype;
  v_res public.planning_reservations%rowtype;
  v_lot uuid;
  v_unit_key text := split_part(p_demand_key, '|', 1);
  v_accessory_id text := split_part(p_demand_key, '|', 2);
  v_ordinal_text text := split_part(p_demand_key, '|', 3);
begin
  if not public.can_manage_planning() then
    raise exception using errcode = '42501', message = 'PLANNING_ACCESS_DENIED';
  end if;
  if p_kind not in ('soft_quote', 'order')
    or nullif(btrim(coalesce(p_demand_key, '')), '') is null
    or nullif(btrim(coalesce(p_item_number, '')), '') is null
    or v_unit_key = '' or v_accessory_id = ''
    or v_ordinal_text !~ '^[1-9][0-9]{0,2}$'
    or split_part(p_demand_key, '|', 4) <> '' then
    raise exception using errcode = '23514', message = 'PLANNING_INVALID_DEMAND';
  end if;
  select * into v_actor from public.app_users where auth_user_id = auth.uid()
    and approved is true and is_active is true limit 1;
  select * into v_config from public.configurations where id = p_configuration_id;
  if not found then
    raise exception using errcode = '23503', message = 'PLANNING_CONFIGURATION_NOT_FOUND';
  end if;
  if v_actor.portal_role::text <> 'timan_backend'
    and v_config.created_by_user_id is distinct from auth.uid()
    and v_config.assigned_seller_id is distinct from v_actor.id then
    raise exception using errcode = '42501', message = 'PLANNING_CONFIGURATION_OUTSIDE_SCOPE';
  end if;
  if (p_kind = 'soft_quote' and (v_config.quote_number is null
      or (v_config.order_number is not null and v_config.submitted_at is not null)))
    or (p_kind = 'order' and (v_config.order_number is null or v_config.submitted_at is null)) then
    raise exception using errcode = '23514', message = 'PLANNING_DOCUMENT_NOT_ACTIVE';
  end if;
  if public.planning_selected_accessory_quantity(v_config.state_json, v_unit_key,
    p_item_number, v_accessory_id) < v_ordinal_text::integer then
    raise exception using errcode = '23514', message = 'PLANNING_ITEM_NOT_IN_CONFIGURATION';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_item_number, 0));
  select * into v_res from public.planning_reservations
  where configuration_id = p_configuration_id and demand_key = p_demand_key
    and status = 'active' for update;
  if found and (v_res.item_number <> p_item_number or v_res.item_kind <> 'quantity') then
    raise exception using errcode = '23514', message = 'PLANNING_DEMAND_ITEM_CHANGED';
  end if;
  if found and v_res.reservation_type = 'order' and p_kind = 'soft_quote' then
    return v_res;
  end if;
  if found and v_res.reservation_type = 'locked_quote' and p_kind = 'soft_quote' then
    update public.planning_reservations
    set requested_delivery_date = p_requested_date, updated_at = now()
    where id = v_res.id returning * into v_res;
    return v_res;
  end if;
  if found and v_res.reservation_type = p_kind
    and v_res.requested_delivery_date is not distinct from p_requested_date then
    return v_res;
  end if;

  if found then
    update public.planning_reservations
    set supply_lot_id = null, reservation_type = p_kind,
      requested_delivery_date = p_requested_date,
      lock_reason = null, lock_review_date = null,
      assigned_at = null, updated_at = now()
    where id = v_res.id returning * into v_res;
  else
    insert into public.planning_reservations
      (configuration_id, demand_key, item_number, item_kind, quantity,
        reservation_type, requested_delivery_date, created_by)
    values (p_configuration_id, p_demand_key, p_item_number, 'quantity', 1,
      p_kind, p_requested_date, v_actor.id)
    returning * into v_res;
  end if;

  if p_kind = 'order' then
    insert into public.planning_events
      (reservation_id, configuration_id, event_type, reason)
    select id, configuration_id, 'quote_quantity_displaced_by_order',
      'Higher priority order allocation'
    from public.planning_reservations
    where item_number = p_item_number and item_kind = 'quantity'
      and status = 'active' and reservation_type = 'soft_quote'
      and supply_lot_id is not null;
    update public.planning_reservations
    set supply_lot_id = null, assigned_at = null, updated_at = now()
    where item_number = p_item_number and item_kind = 'quantity'
      and status = 'active' and reservation_type = 'soft_quote';
    v_lot := public.planning_pick_lot(p_item_number, p_requested_date);
    if v_lot is not null then
      update public.planning_reservations
      set supply_lot_id = v_lot, assigned_at = now(), updated_at = now()
      where id = v_res.id returning * into v_res;
    end if;
  end if;
  perform public.planning_reflow_quantity(p_item_number);
  select * into v_res from public.planning_reservations where id = v_res.id;
  insert into public.planning_events
    (reservation_id, configuration_id, event_type, actor_user_id)
  values (v_res.id, p_configuration_id,
    case when p_kind = 'order' then 'order_quantity_allocation'
      else 'quote_quantity_reservation' end, v_actor.id);
  return v_res;
end;
$$;
revoke all on function public.planning_reserve_quantity(uuid,text,text,date,text) from public, anon;
grant execute on function public.planning_reserve_quantity(uuid,text,text,date,text) to authenticated;


-- Keep serial reflow distinct from quantity lots.
create or replace function public.planning_reflow_soft(p_item_number text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_row record;
  v_unit uuid;
begin
  insert into public.planning_events
    (reservation_id, configuration_id, event_type, previous_supply_unit_id, reason)
  select id, configuration_id, 'soft_reflow_release', supply_unit_id, 'Automatic best-fit reflow'
  from public.planning_reservations
  where item_number = p_item_number and item_kind = 'serialized' and status = 'active'
    and reservation_type = 'soft_quote' and supply_unit_id is not null;

  update public.planning_reservations set supply_unit_id = null, assigned_at = null, updated_at = now()
  where item_number = p_item_number and item_kind = 'serialized' and status = 'active' and reservation_type = 'soft_quote';

  for v_row in
    select id, configuration_id, requested_delivery_date
    from public.planning_reservations
    where item_number = p_item_number and item_kind = 'serialized' and status = 'active' and reservation_type = 'soft_quote'
    order by requested_delivery_date nulls first, created_at, id
  loop
    v_unit := public.planning_pick_serial(p_item_number, v_row.requested_delivery_date, false);
    if v_unit is not null then
      update public.planning_reservations
      set supply_unit_id = v_unit, assigned_at = now(), updated_at = now()
      where id = v_row.id;
      insert into public.planning_events
        (reservation_id, configuration_id, event_type, next_supply_unit_id, reason)
      values (v_row.id, v_row.configuration_id, 'soft_reflow_assign', v_unit, 'Automatic best-fit reflow');
    end if;
  end loop;
end;
$$;
revoke all on function public.planning_reflow_soft(text) from public, anon, authenticated;

-- Serialized attachments use the same priority engine as machines, with
-- canonical accessory ID validation before allocation.
create or replace function public.planning_reserve_machine(
  p_configuration_id uuid,
  p_demand_key text,
  p_item_number text,
  p_requested_date date,
  p_kind text
)
returns public.planning_reservations
language plpgsql security definer set search_path = ''
as $$
declare
  v_config public.configurations%rowtype;
  v_actor public.app_users%rowtype;
  v_res public.planning_reservations%rowtype;
  v_unit uuid;
  v_previous_unit uuid;
begin
  if not public.can_manage_planning() then
    raise exception using errcode = '42501', message = 'PLANNING_ACCESS_DENIED';
  end if;
  if p_kind not in ('soft_quote', 'order') or nullif(btrim(p_demand_key), '') is null then
    raise exception using errcode = '23514', message = 'PLANNING_INVALID_DEMAND';
  end if;
  select * into v_actor from public.app_users where auth_user_id = auth.uid()
    and approved is true and is_active is true limit 1;
  select * into v_config from public.configurations where id = p_configuration_id;
  if not found then
    raise exception using errcode = '23503', message = 'PLANNING_CONFIGURATION_NOT_FOUND';
  end if;
  if v_actor.portal_role::text <> 'timan_backend'
    and v_config.created_by_user_id is distinct from auth.uid()
    and v_config.assigned_seller_id is distinct from v_actor.id then
    raise exception using errcode = '42501', message = 'PLANNING_CONFIGURATION_OUTSIDE_SCOPE';
  end if;
  if (p_kind = 'soft_quote' and (v_config.quote_number is null
      or (v_config.order_number is not null and v_config.submitted_at is not null)))
    or (p_kind = 'order' and (v_config.order_number is null or v_config.submitted_at is null)) then
    raise exception using errcode = '23514', message = 'PLANNING_DOCUMENT_NOT_ACTIVE';
  end if;
  if not (
    exists (
      select 1 from public.planning_machine_products m
      where m.item_number = p_item_number
        and exists (
          select 1 from pg_catalog.jsonb_array_elements(
            coalesce(v_config.state_json -> 'machineConfigs', '[]'::jsonb)) c(value)
          cross join lateral pg_catalog.generate_series(
            1, least(100, greatest(1, case when c.value ->> 'qty' ~ '^[0-9]{1,3}$'
              then (c.value ->> 'qty')::integer else 1 end))
          ) unit_no
          where c.value ->> 'type' = m.machine_key
            and p_demand_key = (c.value ->> 'id') || '_' || unit_no::text
        )
    )
    or (
      split_part(p_demand_key, '|', 3) ~ '^[1-9][0-9]{0,2}$'
      and split_part(p_demand_key, '|', 4) = ''
      and public.planning_selected_accessory_quantity(
        v_config.state_json, split_part(p_demand_key, '|', 1), p_item_number,
        split_part(p_demand_key, '|', 2))
        >= case when split_part(p_demand_key, '|', 3) ~ '^[1-9][0-9]{0,2}$'
          then split_part(p_demand_key, '|', 3)::integer else 0 end
    )
  ) then
    raise exception using errcode = '23514', message = 'PLANNING_ITEM_NOT_IN_CONFIGURATION';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_item_number, 0));
  select * into v_res from public.planning_reservations
  where configuration_id = p_configuration_id and demand_key = p_demand_key and status = 'active'
  for update;
  if found and v_res.item_number <> p_item_number then
    raise exception using errcode = '23514', message = 'PLANNING_DEMAND_ITEM_CHANGED';
  end if;
  if found and v_res.reservation_type = 'order' and p_kind = 'soft_quote' then
    return v_res;
  end if;
  if found and v_res.reservation_type = 'locked_quote' and p_kind = 'soft_quote' then
    update public.planning_reservations
    set requested_delivery_date = p_requested_date, updated_at = now()
    where id = v_res.id returning * into v_res;
    return v_res;
  end if;
  if found and v_res.reservation_type = p_kind and v_res.requested_delivery_date is not distinct from p_requested_date then
    return v_res;
  end if;
  v_previous_unit := v_res.supply_unit_id;

  if found then
    update public.planning_reservations
    set supply_unit_id = null, reservation_type = p_kind,
      requested_delivery_date = p_requested_date, lock_reason = null,
      lock_review_date = null, assigned_at = null, updated_at = now()
    where id = v_res.id returning * into v_res;
  else
    insert into public.planning_reservations
      (configuration_id, demand_key, item_number, reservation_type, requested_delivery_date, created_by)
    values (p_configuration_id, p_demand_key, p_item_number, p_kind, p_requested_date, v_actor.id)
    returning * into v_res;
  end if;

  if p_kind = 'order' then
    select u.id into v_unit
    from public.planning_supply_units u
    join public.planning_supply_sources s on s.source_system = u.source_system
    where u.id = v_previous_unit and u.item_number = p_item_number
      and u.supply_status in ('available', 'incoming', 'in_production')
      and s.connected
      and s.last_synced_at + s.freshness_limit_hours * interval '1 hour' >= now();
    if v_unit is null then
      v_unit := public.planning_pick_serial(p_item_number, p_requested_date, true);
    end if;
    if v_unit is not null then
      -- A soft quote can be displaced; locked quotes and orders cannot.
      insert into public.planning_events
        (reservation_id, configuration_id, event_type, previous_supply_unit_id, reason)
      select id, configuration_id, 'quote_displaced_by_order', supply_unit_id,
        'Higher priority order allocation'
      from public.planning_reservations
      where supply_unit_id = v_unit and status = 'active' and reservation_type = 'soft_quote';
      update public.planning_reservations
      set supply_unit_id = null, assigned_at = null, updated_at = now()
      where supply_unit_id = v_unit and status = 'active' and reservation_type = 'soft_quote';
      update public.planning_reservations
      set supply_unit_id = v_unit, assigned_at = now(), updated_at = now()
      where id = v_res.id returning * into v_res;
    end if;
  end if;
  perform public.planning_reflow_soft(p_item_number);
  select * into v_res from public.planning_reservations where id = v_res.id;
  insert into public.planning_events
    (reservation_id, configuration_id, event_type, actor_user_id, next_supply_unit_id)
  values (v_res.id, p_configuration_id,
    case when p_kind = 'order' then 'order_allocation' else 'quote_reservation' end,
    v_actor.id, v_res.supply_unit_id);
  return v_res;
end;
$$;
revoke all on function public.planning_reserve_machine(uuid,text,text,date,text) from public, anon;
grant execute on function public.planning_reserve_machine(uuid,text,text,date,text) to authenticated;

-- Only a real quote or submitted order creates demand. Ordinary case/lead
-- saves remain untouched; all line keys are derived from the saved state.
create or replace function public.planning_sync_configuration_transition()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_machine jsonb;
  v_accessory record;
  v_item text;
  v_unit_key text;
  v_accessory_key text;
  v_date date;
  v_unit integer;
  v_count integer;
  v_quantity integer;
  v_piece integer;
  v_serialized boolean;
  v_kind text;
  v_seen text[] := array[]::text[];
  v_old public.planning_reservations%rowtype;
begin
  if not public.can_manage_planning() then return new; end if;
  if coalesce(new.case_status, '') = 'deleted' or coalesce(new.status, '') = 'deleted' then
    for v_old in
      select * from public.planning_reservations
      where configuration_id = new.id and status = 'active'
      order by item_number, demand_key
    loop
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_old.item_number, 0));
      update public.planning_reservations
      set status = 'released', released_at = now(), supply_unit_id = null,
        supply_lot_id = null, updated_at = now()
      where id = v_old.id;
      insert into public.planning_events
        (reservation_id, configuration_id, event_type, previous_supply_unit_id, reason)
      values (v_old.id, new.id, 'document_deleted', v_old.supply_unit_id,
        'Canonical document deleted');
      if v_old.item_kind = 'quantity' then
        perform public.planning_reflow_quantity(v_old.item_number);
      else
        perform public.planning_reflow_soft(v_old.item_number);
      end if;
    end loop;
    return new;
  end if;
  if new.order_number is not null and new.submitted_at is not null then
    v_kind := 'order';
  elsif new.quote_number is not null
    and coalesce(new.document_type, new.case_type, 'quote') <> 'order'
    and coalesce(new.case_status, new.status, '') <> 'deleted' then
    v_kind := 'soft_quote';
  else
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.quote_number is not distinct from old.quote_number
      and new.order_number is not distinct from old.order_number
      and new.submitted_at is not distinct from old.submitted_at
      and new.delivery_date is not distinct from old.delivery_date
      and new.state_json is not distinct from old.state_json then
      return new;
    end if;
  end if;

  -- Lock every affected item in one order before any reservation changes.
  for v_item in
    select affected.item_number from (
      select mp.item_number
      from pg_catalog.jsonb_array_elements(
        coalesce(new.state_json -> 'machineConfigs', '[]'::jsonb)) m(value)
      join public.planning_machine_products mp on mp.machine_key = m.value ->> 'type'
      union
      select ap.item_number
      from pg_catalog.jsonb_array_elements(
        coalesce(new.state_json -> 'machineConfigs', '[]'::jsonb)) m(value)
      join public.planning_accessory_products ap on ap.machine_key = m.value ->> 'type'
      union
      select r.item_number from public.planning_reservations r
      where r.configuration_id = new.id and r.status = 'active'
    ) affected order by affected.item_number
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_item, 0));
  end loop;

  for v_machine in
    select value from pg_catalog.jsonb_array_elements(
      coalesce(new.state_json -> 'machineConfigs', '[]'::jsonb))
  loop
    if nullif(v_machine ->> 'id', '') is null then continue; end if;
    select item_number into v_item from public.planning_machine_products
    where machine_key = v_machine ->> 'type';
    v_count := least(100, greatest(1, case when v_machine ->> 'qty' ~ '^[0-9]{1,3}$'
      then (v_machine ->> 'qty')::integer else 1 end));
    for v_unit in 1..v_count loop
      v_unit_key := (v_machine ->> 'id') || '_' || v_unit::text;
      v_date := new.delivery_date;
      if (new.state_json -> 'machineDeliveryDates' ->> v_unit_key) ~ '^\d{4}-\d{2}-\d{2}$' then
        v_date := (new.state_json -> 'machineDeliveryDates' ->> v_unit_key)::date;
      end if;
      if v_item is not null then
        v_seen := array_append(v_seen, v_unit_key);
        perform public.planning_reserve_machine(new.id, v_unit_key, v_item, v_date, v_kind);
      end if;
      for v_accessory in
        select accessory_id, item_number from public.planning_accessory_products
        where machine_key = v_machine ->> 'type'
        order by item_number, accessory_id
      loop
        v_quantity := public.planning_selected_accessory_quantity(
          new.state_json, v_unit_key, v_accessory.item_number, v_accessory.accessory_id);
        if v_quantity = 0 then continue; end if;
        select exists (select 1 from public.planning_supply_units
          where item_number = v_accessory.item_number and serial_number is not null)
          into v_serialized;
        for v_piece in 1..v_quantity loop
          v_accessory_key := v_unit_key || '|' || v_accessory.accessory_id || '|' || v_piece::text;
          v_seen := array_append(v_seen, v_accessory_key);
          select * into v_old from public.planning_reservations
          where configuration_id = new.id and demand_key = v_accessory_key
            and status = 'active' for update;
          if found and (
            (v_serialized and v_old.item_kind <> 'serialized')
            or (not v_serialized and v_old.item_kind <> 'quantity')
          ) then
            update public.planning_reservations
            set status = 'released', released_at = now(), supply_unit_id = null,
              supply_lot_id = null, updated_at = now()
            where id = v_old.id;
            insert into public.planning_events
              (reservation_id, configuration_id, event_type, previous_supply_unit_id, reason)
            values (v_old.id, new.id, 'supply_kind_changed', v_old.supply_unit_id,
              'Source supply classification changed');
            if v_old.item_kind = 'quantity' then
              perform public.planning_reflow_quantity(v_old.item_number);
            else
              perform public.planning_reflow_soft(v_old.item_number);
            end if;
          end if;
          if v_serialized then
            perform public.planning_reserve_machine(new.id, v_accessory_key,
              v_accessory.item_number, v_date, v_kind);
          else
            perform public.planning_reserve_quantity(new.id, v_accessory_key,
              v_accessory.item_number, v_date, v_kind);
          end if;
        end loop;
      end loop;
    end loop;
  end loop;

  for v_old in
    select * from public.planning_reservations
    where configuration_id = new.id and status = 'active'
      and not (demand_key = any(v_seen))
    order by item_number, demand_key
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_old.item_number, 0));
    update public.planning_reservations
    set status = 'released', released_at = now(), supply_unit_id = null,
      supply_lot_id = null, updated_at = now()
    where id = v_old.id;
    insert into public.planning_events
      (reservation_id, configuration_id, event_type, previous_supply_unit_id, reason)
    values (v_old.id, new.id, 'demand_removed', v_old.supply_unit_id,
      'Configuration revised');
    if v_old.item_kind = 'quantity' then
      perform public.planning_reflow_quantity(v_old.item_number);
    else
      perform public.planning_reflow_soft(v_old.item_number);
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.planning_sync_configuration_transition()
  from public, anon, authenticated;

-- Availability counts only actual allocations in eligible source lots. An
-- unassigned demand or an allocation in a later lot cannot consume today's stock.
create or replace function public.planning_get_availability(
  p_item_number text, p_requested_date date, p_quantity integer default 1
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_date date := coalesce(p_requested_date, current_date);
  v_stock integer := 0;
  v_incoming integer := 0;
  v_free_by_date integer := 0;
  v_soft_by_date integer := 0;
  v_later integer := 0;
  v_serial_rows integer := 0;
  v_lot_rows integer := 0;
  v_lot_stock integer := 0;
  v_lot_incoming integer := 0;
  v_lot_free integer := 0;
  v_lot_soft integer := 0;
  v_lot_later integer := 0;
  v_next_serial date;
  v_next_lot date;
  v_source_state text;
  v_status text;
begin
  if not public.can_access_planning() then
    raise exception using errcode = '42501', message = 'PLANNING_ACCESS_DENIED';
  end if;
  if nullif(btrim(coalesce(p_item_number, '')), '') is null
    or p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception using errcode = '23514', message = 'PLANNING_INVALID_AVAILABILITY_REQUEST';
  end if;
  if not exists (select 1 from public.planning_supply_sources where connected) then
    v_source_state := 'missing';
  elsif not exists (
    select 1 from public.planning_supply_sources
    where connected and last_synced_at is not null
      and last_synced_at <= now()
      and last_synced_at + freshness_limit_hours * interval '1 hour' >= now()
  ) then
    v_source_state := 'stale';
  else
    v_source_state := 'fresh';
  end if;
  if v_source_state = 'fresh' then
    with serialized as (
      select u.supply_status,
        coalesce(u.available_at,
          case when u.supply_status = 'available' then current_date end) as ready_date,
        r.reservation_type
      from public.planning_supply_units u
      join public.planning_supply_sources s on s.source_system = u.source_system
      left join public.planning_reservations r
        on r.supply_unit_id = u.id and r.status = 'active'
      where u.item_number = p_item_number and u.serial_number is not null
        and u.supply_status in ('available', 'incoming', 'in_production')
        and s.connected and s.last_synced_at is not null
        and s.last_synced_at <= now()
        and s.last_synced_at + s.freshness_limit_hours * interval '1 hour' >= now()
    )
    select count(*)::integer,
      count(*) filter (where supply_status = 'available'
        and ready_date <= current_date)::integer,
      count(*) filter (where supply_status in ('incoming', 'in_production'))::integer,
      count(*) filter (where ready_date <= v_date and reservation_type is null)::integer,
      count(*) filter (where ready_date <= v_date
        and reservation_type = 'soft_quote')::integer,
      count(*) filter (where ready_date > v_date and ready_date <= v_date + 90
        and reservation_type is null)::integer,
      min(ready_date) filter (where reservation_type is null)
    into v_serial_rows, v_stock, v_incoming, v_free_by_date,
      v_soft_by_date, v_later, v_next_serial
    from serialized;

    with lots as (
      select l.quantity, l.supply_status,
        coalesce(l.available_at,
          case when l.supply_status = 'available' then current_date end) as ready_date,
        greatest(0, l.quantity - occupied.total) as free_quantity,
        occupied.soft as soft_quantity
      from public.planning_supply_lots l
      join public.planning_supply_sources s on s.source_system = l.source_system
      left join lateral (
        select count(*)::integer as total,
          count(*) filter (where r.reservation_type = 'soft_quote')::integer as soft
        from public.planning_reservations r
        where r.supply_lot_id = l.id and r.status = 'active'
      ) occupied on true
      where l.item_number = p_item_number and l.quantity > 0
        and l.supply_status in ('available', 'incoming', 'in_production')
        and s.connected and s.last_synced_at is not null
        and s.last_synced_at <= now()
        and s.last_synced_at + s.freshness_limit_hours * interval '1 hour' >= now()
    )
    select count(*)::integer,
      coalesce(sum(quantity) filter (where supply_status = 'available'
        and ready_date <= current_date), 0)::integer,
      coalesce(sum(quantity) filter (where supply_status in ('incoming', 'in_production')), 0)::integer,
      coalesce(sum(free_quantity) filter (where ready_date <= v_date), 0)::integer,
      coalesce(sum(soft_quantity) filter (where ready_date <= v_date), 0)::integer,
      coalesce(sum(free_quantity) filter (where ready_date > v_date
        and ready_date <= v_date + 90), 0)::integer,
      min(ready_date) filter (where free_quantity > 0)
    into v_lot_rows, v_lot_stock, v_lot_incoming, v_lot_free,
      v_lot_soft, v_lot_later, v_next_lot
    from lots;
    v_stock := v_stock + v_lot_stock;
    v_incoming := v_incoming + v_lot_incoming;
    v_free_by_date := v_free_by_date + v_lot_free;
    v_soft_by_date := v_soft_by_date + v_lot_soft;
    v_later := v_later + v_lot_later;
  end if;
  if v_source_state <> 'fresh' or v_serial_rows + v_lot_rows = 0 then
    v_status := 'unknown';
  elsif v_free_by_date >= p_quantity then
    v_status := 'green';
  elsif v_free_by_date + v_soft_by_date >= p_quantity or v_later > 0 then
    v_status := 'yellow';
  else
    v_status := 'red';
  end if;
  return pg_catalog.jsonb_build_object(
    'status', v_status, 'source_state', v_source_state,
    'item_number', p_item_number, 'requested_date', v_date,
    'stock', v_stock, 'incoming', v_incoming,
    'free_by_date', v_free_by_date, 'soft_by_date', v_soft_by_date,
    'next_available', coalesce(least(v_next_serial, v_next_lot),
      v_next_serial, v_next_lot)
  );
end;
$$;
revoke all on function public.planning_get_availability(text,date,integer) from public, anon;
grant execute on function public.planning_get_availability(text,date,integer) to authenticated;


-- Manual quote lock/unlock and release dispatch to the correct supply kind.
create or replace function public.planning_lock_quote(
  p_reservation_id uuid, p_reason text, p_review_date date default null, p_locked boolean default true
)
returns public.planning_reservations
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.planning_reservations%rowtype;
  v_actor public.app_users%rowtype;
begin
  if not public.can_manage_planning() then
    raise exception using errcode = '42501', message = 'PLANNING_ACCESS_DENIED';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception using errcode = '23514', message = 'PLANNING_REASON_REQUIRED';
  end if;
  select * into v_actor from public.app_users where auth_user_id = auth.uid() limit 1;
  select r.* into v_row from public.planning_reservations r
    where r.id = p_reservation_id and r.status = 'active';
  if not found then raise exception using errcode = '23503', message = 'PLANNING_RESERVATION_NOT_FOUND'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_row.item_number, 0));
  select r.* into v_row from public.planning_reservations r
    join public.configurations c on c.id = r.configuration_id
    where r.id = p_reservation_id and r.status = 'active'
      and r.reservation_type in ('soft_quote', 'locked_quote')
      and (v_actor.portal_role::text = 'timan_backend'
        or c.created_by_user_id = auth.uid() or c.assigned_seller_id = v_actor.id)
    for update of r;
  if not found then raise exception using errcode = '42501', message = 'PLANNING_QUOTE_OUTSIDE_SCOPE'; end if;
  update public.planning_reservations
  set reservation_type = case when p_locked then 'locked_quote' else 'soft_quote' end,
    lock_reason = case when p_locked then btrim(p_reason) else null end,
    lock_review_date = case when p_locked then p_review_date else null end,
    updated_at = now()
  where id = p_reservation_id returning * into v_row;
  insert into public.planning_events
    (reservation_id, configuration_id, event_type, actor_user_id,
     previous_supply_unit_id, next_supply_unit_id, reason)
  values (v_row.id, v_row.configuration_id,
    case when p_locked then 'quote_lock' else 'quote_unlock' end,
    v_actor.id, v_row.supply_unit_id, v_row.supply_unit_id, btrim(p_reason));
  if not p_locked then
    if v_row.item_kind = 'quantity' then
      perform public.planning_reflow_quantity(v_row.item_number);
    else
      perform public.planning_reflow_soft(v_row.item_number);
    end if;
  end if;
  return v_row;
end;
$$;
revoke all on function public.planning_lock_quote(uuid,text,date,boolean) from public, anon;
grant execute on function public.planning_lock_quote(uuid,text,date,boolean) to authenticated;

create or replace function public.planning_release_reservation(
  p_reservation_id uuid, p_reason text
)
returns public.planning_reservations
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor public.app_users%rowtype;
  v_res public.planning_reservations%rowtype;
  v_previous uuid;
begin
  if not public.can_manage_planning() then
    raise exception using errcode = '42501', message = 'PLANNING_ACCESS_DENIED';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception using errcode = '23514', message = 'PLANNING_REASON_REQUIRED';
  end if;
  select * into v_actor from public.app_users where auth_user_id = auth.uid() limit 1;
  select * into v_res from public.planning_reservations
    where id = p_reservation_id and status = 'active';
  if not found then raise exception using errcode = '23503', message = 'PLANNING_RESERVATION_NOT_FOUND'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_res.item_number, 0));
  select * into v_res from public.planning_reservations
    where id = p_reservation_id and status = 'active' for update;
  if not found then raise exception using errcode = '23503', message = 'PLANNING_RESERVATION_NOT_FOUND'; end if;
  if not public.planning_can_view_configuration(v_res.configuration_id)
    or (v_res.reservation_type <> 'soft_quote' and v_actor.portal_role::text <> 'timan_backend') then
    raise exception using errcode = '42501', message = 'PLANNING_RELEASE_DENIED';
  end if;
  v_previous := v_res.supply_unit_id;
  update public.planning_reservations
    set status = 'released', released_at = now(), supply_unit_id = null,
      supply_lot_id = null, updated_at = now()
    where id = v_res.id returning * into v_res;
  insert into public.planning_events
    (reservation_id, configuration_id, event_type, actor_user_id, previous_supply_unit_id, reason)
    values (v_res.id, v_res.configuration_id, 'manual_release', v_actor.id, v_previous, btrim(p_reason));
  if v_res.item_kind = 'quantity' then
    perform public.planning_reflow_quantity(v_res.item_number);
  else
    perform public.planning_reflow_soft(v_res.item_number);
  end if;
  return v_res;
end;
$$;
revoke all on function public.planning_release_reservation(uuid,text) from public, anon;
grant execute on function public.planning_release_reservation(uuid,text) to authenticated;
