-- Planning keeps identifier mappings for both live and historical cases.
-- Add the replacement without removing the retired SKU mappings.
insert into public.planning_accessory_products (
  machine_key, accessory_id, item_number, is_quantity_input
)
values
  ('Timan 3330', '730016-00-SAM', '730016-00-SAM', false),
  ('LOOSE_TOOL', '730016-00-SAM', '730016-00-SAM', false)
on conflict (machine_key, accessory_id) do update
set item_number = excluded.item_number,
    is_quantity_input = excluded.is_quantity_input;
