-- The replacement is already represented by two separate Product Master rows.
-- Do not expose the retired SKU as a current Price List search alias.
update public.price_list_items
set renamed_from_item_number = null,
    updated_at = now()
where item_number = '730016-00-SAM'
  and renamed_from_item_number = '730106';
