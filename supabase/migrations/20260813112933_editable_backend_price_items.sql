alter table public.price_list_items
  add column if not exists renamed_from_item_number text;

create unique index if not exists price_list_items_renamed_from_item_number_idx
on public.price_list_items (renamed_from_item_number)
where renamed_from_item_number is not null;

create or replace function public.update_price_list_item(
  p_item_number text,
  p_new_item_number text,
  p_item_text_da text,
  p_price_dkk numeric,
  p_price_eur numeric,
  p_price_sek numeric,
  p_cost_price_dkk numeric default null
)
returns public.price_list_items
language plpgsql
security definer
set search_path = public
as $$
declare
  out_row public.price_list_items;
  existing public.price_list_items%rowtype;
  source_item_number text := nullif(trim(p_item_number), '');
  target_item_number text := coalesce(nullif(trim(p_new_item_number), ''), nullif(trim(p_item_number), ''));
  has_price_change boolean;
  has_cost_change boolean;
begin
  if not public.is_timan_backend() then
    raise exception 'Kun backend kan rette prislister.' using errcode = '42501';
  end if;

  if source_item_number is null or target_item_number is null then
    raise exception 'Varenr mangler.' using errcode = '22023';
  end if;

  select * into existing
  from public.price_list_items
  where item_number = source_item_number
     or renamed_from_item_number = source_item_number;

  if not found then
    insert into public.price_list_items (
      item_number,
      renamed_from_item_number,
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
      target_item_number,
      case when target_item_number is distinct from source_item_number then source_item_number else null end,
      p_item_text_da,
      p_price_dkk,
      p_price_eur,
      p_price_sek,
      p_cost_price_dkk,
      case when p_cost_price_dkk is null then null else 'manual' end,
      case when p_cost_price_dkk is null then null else now() end,
      auth.uid(),
      coalesce(auth.jwt() ->> 'email', null),
      now(),
      true
    )
    returning * into out_row;

    return out_row;
  end if;

  has_price_change :=
    target_item_number is distinct from existing.item_number
    or p_item_text_da is distinct from existing.item_text_da
    or p_price_dkk is distinct from existing.price_dkk
    or p_price_eur is distinct from existing.price_eur
    or p_price_sek is distinct from existing.price_sek;
  has_cost_change := p_cost_price_dkk is distinct from existing.cost_price_dkk;

  update public.price_list_items
  set
    item_number = target_item_number,
    renamed_from_item_number = case
      when target_item_number is distinct from coalesce(existing.renamed_from_item_number, source_item_number)
        then coalesce(existing.renamed_from_item_number, source_item_number)
      else existing.renamed_from_item_number
    end,
    item_text_da = p_item_text_da,
    price_dkk = p_price_dkk,
    price_eur = p_price_eur,
    price_sek = p_price_sek,
    cost_price_dkk = p_cost_price_dkk,
    cost_price_source = case when has_cost_change then 'manual' else cost_price_source end,
    cost_price_updated_at = case when has_cost_change then now() else cost_price_updated_at end,
    updated_by = auth.uid(),
    updated_by_email = coalesce(auth.jwt() ->> 'email', null),
    updated_at = now(),
    is_dirty = case when has_price_change then true else is_dirty end
  where id = existing.id
  returning * into out_row;

  return out_row;
end;
$$;

revoke all on function public.update_price_list_item(text, text, text, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.update_price_list_item(text, text, text, numeric, numeric, numeric, numeric) to authenticated;
