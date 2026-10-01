-- Let COST_ONLY imports attach a minimal cost overlay to an existing canonical
-- product. The released Product Master is preferred; the existing shared
-- Configurator resolver may explicitly identify a legacy/static catalog item.
-- No commercial text or sales-price field is read or written in this branch.

create or replace function public.upsert_price_list_items(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  existing public.price_list_items%rowtype;
  canonical_product public.price_list_published%rowtype;
  import_mode text := nullif(trim(coalesce(payload ->> 'import_mode', '')), '');
  machine_scope text := coalesce(nullif(trim(coalesce(payload ->> 'machine_scope', '')), ''), 'all');
  source_file_name text := nullif(trim(coalesce(payload ->> 'file_name', '')), '');
  new_item_number text;
  catalog_source text;
  new_item_text_da text;
  new_price_dkk numeric;
  new_price_eur numeric;
  new_price_sek numeric;
  new_cost_price_dkk numeric;
  has_price_change boolean;
  has_cost_change boolean;
  created_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  processed_count integer := jsonb_array_length(coalesce(payload -> 'rows', '[]'::jsonb));
  errors jsonb := '[]'::jsonb;
  changed_item_numbers text[] := array[]::text[];
  seen_item_numbers text[] := array[]::text[];
  current_email text := coalesce(auth.jwt() ->> 'email', null);
begin
  if not public.is_timan_backend() then
    raise exception 'Kun backend kan importere prislister.' using errcode = '42501';
  end if;

  if import_mode not in ('COST_ONLY', 'FULL_PRICE_LIST') then
    raise exception 'Ugyldig eller manglende import_mode.' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(coalesce(payload -> 'rows', '[]'::jsonb)) loop
    new_item_number := null;
    begin
      new_item_number := nullif(trim(coalesce(r ->> 'item_number', '')), '');
      if new_item_number is null then
        raise exception 'Mangler varenr.';
      end if;
      if new_item_number = any(seen_item_numbers) then
        raise exception 'Duplikeret varenr. i importen.';
      end if;
      seen_item_numbers := array_append(seen_item_numbers, new_item_number);

      -- This is the server-side cost-only whitelist. No non-cost field is read here.
      if import_mode = 'COST_ONLY' then
        new_cost_price_dkk := public.parse_price_number(r ->> 'cost_price_dkk');
        catalog_source := nullif(trim(coalesce(r ->> 'catalog_source', '')), '');

        select * into existing
        from public.price_list_items
        where item_number = new_item_number;

        if not found then
          select * into canonical_product
          from public.price_list_published
          where item_number = new_item_number;

          if not found and catalog_source is distinct from 'CANONICAL_CONFIGURATOR' then
            raise exception 'Varenr. findes ikke i det canonical produktkatalog. Kostprisimport opretter aldrig nye produkter.';
          end if;

          if new_cost_price_dkk is null then
            skipped_count := skipped_count + 1;
            continue;
          end if;

          insert into public.price_list_items (
            item_number,
            cost_price_dkk,
            cost_price_source,
            cost_price_updated_at,
            updated_by,
            updated_by_email,
            updated_at,
            is_dirty,
            last_published_at
          )
          values (
            new_item_number,
            new_cost_price_dkk,
            coalesce(source_file_name, 'cost-only import'),
            now(),
            auth.uid(),
            current_email,
            now(),
            false,
            case when canonical_product.item_number is null then null else canonical_product.published_at end
          );

          updated_count := updated_count + 1;
          changed_item_numbers := array_append(changed_item_numbers, new_item_number);
          continue;
        end if;

        if new_cost_price_dkk is null or new_cost_price_dkk is not distinct from existing.cost_price_dkk then
          skipped_count := skipped_count + 1;
          continue;
        end if;

        update public.price_list_items
        set
          cost_price_dkk = new_cost_price_dkk,
          cost_price_source = coalesce(source_file_name, 'cost-only import'),
          cost_price_updated_at = now(),
          updated_by = auth.uid(),
          updated_by_email = current_email,
          updated_at = now()
        where item_number = new_item_number;

        updated_count := updated_count + 1;
        changed_item_numbers := array_append(changed_item_numbers, new_item_number);
        continue;
      end if;

      new_item_text_da := nullif(trim(coalesce(r ->> 'item_text_da', '')), '');
      new_price_dkk := public.parse_price_number(r ->> 'price_dkk');
      new_price_eur := public.parse_price_number(r ->> 'price_eur');
      new_price_sek := public.parse_price_number(r ->> 'price_sek');
      new_cost_price_dkk := public.parse_price_number(r ->> 'cost_price_dkk');

      select * into existing
      from public.price_list_items
      where item_number = new_item_number;

      if not found then
        insert into public.price_list_items (
          item_number,
          item_text_da,
          price_dkk,
          price_eur,
          price_sek,
          cost_price_dkk,
          cost_price_source,
          cost_price_updated_at,
          updated_by,
          updated_by_email,
          updated_at,
          is_dirty
        )
        values (
          new_item_number,
          new_item_text_da,
          new_price_dkk,
          new_price_eur,
          new_price_sek,
          new_cost_price_dkk,
          case when new_cost_price_dkk is null then null else coalesce(source_file_name, 'full price-list import') end,
          case when new_cost_price_dkk is null then null else now() end,
          auth.uid(),
          current_email,
          now(),
          (new_item_text_da is not null or new_price_dkk is not null or new_price_eur is not null or new_price_sek is not null)
        );
        created_count := created_count + 1;
        changed_item_numbers := array_append(changed_item_numbers, new_item_number);
      else
        has_price_change :=
          (new_item_text_da is not null and new_item_text_da is distinct from existing.item_text_da)
          or (new_price_dkk is not null and new_price_dkk is distinct from existing.price_dkk)
          or (new_price_eur is not null and new_price_eur is distinct from existing.price_eur)
          or (new_price_sek is not null and new_price_sek is distinct from existing.price_sek);

        has_cost_change := new_cost_price_dkk is not null and new_cost_price_dkk is distinct from existing.cost_price_dkk;

        if has_price_change or has_cost_change then
          update public.price_list_items
          set
            item_text_da = coalesce(new_item_text_da, item_text_da),
            price_dkk = coalesce(new_price_dkk, price_dkk),
            price_eur = coalesce(new_price_eur, price_eur),
            price_sek = coalesce(new_price_sek, price_sek),
            cost_price_dkk = coalesce(new_cost_price_dkk, cost_price_dkk),
            cost_price_source = case when new_cost_price_dkk is null then cost_price_source else coalesce(source_file_name, 'full price-list import') end,
            cost_price_updated_at = case when new_cost_price_dkk is null then cost_price_updated_at else now() end,
            updated_by = auth.uid(),
            updated_by_email = current_email,
            updated_at = now(),
            is_dirty = case when has_price_change then true else is_dirty end
          where item_number = new_item_number;
          updated_count := updated_count + 1;
          changed_item_numbers := array_append(changed_item_numbers, new_item_number);
        else
          skipped_count := skipped_count + 1;
        end if;
      end if;
    exception when others then
      errors := errors || jsonb_build_array(jsonb_build_object(
        'item_number', coalesce(new_item_number, r ->> 'item_number'),
        'error', SQLERRM
      ));
    end;
  end loop;

  insert into public.price_list_import_logs (
    imported_by,
    imported_by_email,
    file_name,
    import_mode,
    machine_scope,
    processed_count,
    created_count,
    updated_count,
    skipped_count,
    error_count,
    item_numbers,
    errors
  )
  values (
    auth.uid(),
    current_email,
    source_file_name,
    import_mode,
    machine_scope,
    processed_count,
    created_count,
    updated_count,
    skipped_count,
    jsonb_array_length(errors),
    changed_item_numbers,
    errors
  );

  return jsonb_build_object(
    'created', created_count,
    'updated', updated_count,
    'skipped', skipped_count,
    'errors', errors
  );
end;
$$;

revoke all on function public.upsert_price_list_items(jsonb) from public, anon;
grant execute on function public.upsert_price_list_items(jsonb) to authenticated;
