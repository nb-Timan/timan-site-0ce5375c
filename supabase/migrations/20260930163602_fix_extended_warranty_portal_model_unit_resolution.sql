-- A Portal order may contain several different machine models. The relation is
-- still deterministic when exactly one unit of the requested model exists.
-- Multiple units of that model continue to require an explicit unit key.
create or replace function public.resolve_portal_extended_warranty_item(
  p_order_number text,
  p_machine_model text,
  p_unit_key text default null
)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  with products(item_number) as (
    values ('795015'::text), ('795016'::text), ('795018'::text)
  ), matching_configurations as (
    select c.id
    from public.configurations c
    where upper(btrim(c.order_number)) = upper(btrim(p_order_number))
      and (
        nullif(btrim(p_unit_key), '') is not null
        or (
          select coalesce(sum(greatest(coalesce(ci.machine_qty, 0), 0)), 0)
          from public.configuration_items ci
          cross join products
          where ci.configuration_id = c.id
            and public.is_canonical_extended_warranty_product(products.item_number, p_machine_model)
            and public.is_canonical_extended_warranty_product(products.item_number, ci.machine_type)
        ) = 1
      )
  ), candidates as (
    select distinct products.item_number
    from matching_configurations mc
    join public.configuration_items ci on ci.configuration_id = mc.id
    cross join products
    where public.is_canonical_extended_warranty_product(products.item_number, p_machine_model)
      and public.is_canonical_extended_warranty_product(products.item_number, ci.machine_type)
      and (
        (
          nullif(btrim(p_unit_key), '') is not null
          and coalesce(ci.unit_configs -> p_unit_key -> 'acc', '[]'::jsonb) ? products.item_number
        )
        or (
          nullif(btrim(p_unit_key), '') is null
          and (
            coalesce(ci.accessories, '[]'::jsonb) ? products.item_number
            or exists (
              select 1 from jsonb_each(coalesce(ci.unit_configs, '{}'::jsonb)) unit
              where coalesce(unit.value -> 'acc', '[]'::jsonb) ? products.item_number
            )
          )
        )
      )
  )
  select case when count(*) = 1 then min(item_number) else null end from candidates;
$$;

revoke all on function public.resolve_portal_extended_warranty_item(text, text, text) from public, anon, authenticated;
