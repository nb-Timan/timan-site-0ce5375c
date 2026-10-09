begin;
insert into public.price_list_published(item_number,item_text_da,price_dkk,price_eur,price_sek)
values ('QA-PRODUCT-MASTER-ROLLBACK','QA old identity',100,20,150);
update public.price_list_published set item_text_da='QA new identity',price_dkk=200
where item_number='QA-PRODUCT-MASTER-ROLLBACK';
set local role anon;
do $$
declare row_data jsonb;
begin
  select to_jsonb(p) into row_data from public.list_published_product_master() p where item_number='QA-PRODUCT-MASTER-ROLLBACK';
  if row_data->>'item_text_da' <> 'QA new identity' or (row_data->>'price_dkk')::numeric <> 200
    or not (row_data->'identity_aliases' ? 'QA old identity') then raise exception 'Published identity/price propagation failed'; end if;
  if row_data ? 'cost_price_dkk' or row_data ? 'published_by_email' then raise exception 'Private masterdata leaked'; end if;
  begin
    perform public.publish_price_list_items('{"item_numbers":["QA-PRODUCT-MASTER-ROLLBACK"]}'::jsonb);
    raise exception 'Unauthorized publish allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
rollback;
