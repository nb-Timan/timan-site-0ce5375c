-- Extend the existing canonical price-list product identity with explicit
-- German and English text. Danish remains the existing source column.
alter table public.price_list_items
  add column if not exists item_text_de text,
  add column if not exists item_text_en text;

alter table public.price_list_published
  add column if not exists item_text_de text,
  add column if not exists item_text_en text;

-- Keep the previous RPC overload available while an older frontend build may
-- still be open. The new overload writes all three independent text fields.
create or replace function public.update_price_list_item(
  p_item_number text,
  p_new_item_number text,
  p_item_text_da text,
  p_item_text_de text,
  p_item_text_en text,
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
  has_published_change boolean;
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
      item_number, renamed_from_item_number,
      item_text_da, item_text_de, item_text_en,
      price_dkk, price_eur, price_sek,
      cost_price_dkk, cost_price_source, cost_price_updated_at,
      updated_by, updated_by_email, updated_at, is_dirty
    ) values (
      target_item_number,
      case when target_item_number is distinct from source_item_number then source_item_number else null end,
      p_item_text_da, p_item_text_de, p_item_text_en,
      p_price_dkk, p_price_eur, p_price_sek,
      p_cost_price_dkk,
      case when p_cost_price_dkk is null then null else 'manual' end,
      case when p_cost_price_dkk is null then null else now() end,
      auth.uid(), coalesce(auth.jwt() ->> 'email', null), now(), true
    ) returning * into out_row;
    return out_row;
  end if;

  has_published_change :=
    target_item_number is distinct from existing.item_number
    or p_item_text_da is distinct from existing.item_text_da
    or p_item_text_de is distinct from existing.item_text_de
    or p_item_text_en is distinct from existing.item_text_en
    or p_price_dkk is distinct from existing.price_dkk
    or p_price_eur is distinct from existing.price_eur
    or p_price_sek is distinct from existing.price_sek;
  has_cost_change := p_cost_price_dkk is distinct from existing.cost_price_dkk;

  update public.price_list_items
  set item_number = target_item_number,
      renamed_from_item_number = case
        when target_item_number is distinct from coalesce(existing.renamed_from_item_number, source_item_number)
          then coalesce(existing.renamed_from_item_number, source_item_number)
        else existing.renamed_from_item_number
      end,
      item_text_da = p_item_text_da,
      item_text_de = p_item_text_de,
      item_text_en = p_item_text_en,
      price_dkk = p_price_dkk,
      price_eur = p_price_eur,
      price_sek = p_price_sek,
      cost_price_dkk = p_cost_price_dkk,
      cost_price_source = case when has_cost_change then 'manual' else cost_price_source end,
      cost_price_updated_at = case when has_cost_change then now() else cost_price_updated_at end,
      updated_by = auth.uid(),
      updated_by_email = coalesce(auth.jwt() ->> 'email', null),
      updated_at = now(),
      is_dirty = case when has_published_change then true else is_dirty end
  where id = existing.id
  returning * into out_row;

  return out_row;
end;
$$;

revoke all on function public.update_price_list_item(
  text, text, text, text, text, numeric, numeric, numeric, numeric
) from public, anon;
grant execute on function public.update_price_list_item(
  text, text, text, text, text, numeric, numeric, numeric, numeric
) to authenticated;

alter table public.price_list_item_history
  drop constraint if exists price_list_item_history_field_name_check;

alter table public.price_list_item_history
  add constraint price_list_item_history_field_name_check
  check (field_name in (
    'item_number',
    'item_text_da',
    'item_text_de',
    'item_text_en',
    'cost_price_dkk',
    'price_dkk',
    'price_sek',
    'price_eur'
  ));

create or replace function public.record_price_list_item_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_change_set_id uuid := gen_random_uuid();
  v_actor_user_id uuid;
  v_actor_name text;
  v_actor_initials text;
  v_actor_email text := coalesce(auth.jwt() ->> 'email', new.updated_by_email);
begin
  if old.item_number is not distinct from new.item_number
    and old.item_text_da is not distinct from new.item_text_da
    and old.item_text_de is not distinct from new.item_text_de
    and old.item_text_en is not distinct from new.item_text_en
    and old.cost_price_dkk is not distinct from new.cost_price_dkk
    and old.price_dkk is not distinct from new.price_dkk
    and old.price_sek is not distinct from new.price_sek
    and old.price_eur is not distinct from new.price_eur then
    return new;
  end if;

  select au.id,
         coalesce(nullif(au.display_name, ''), nullif(au.full_name, ''), au.email),
         au.initials,
         au.email
  into v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email
  from public.app_users as au
  where au.auth_user_id = auth.uid()
     or lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by (au.auth_user_id = auth.uid()) desc
  limit 1;

  v_actor_email := coalesce(v_actor_email, auth.jwt() ->> 'email', new.updated_by_email);

  if old.item_number is distinct from new.item_number then
    insert into public.price_list_item_history (
      change_set_id, item_id, item_number, actor_user_id, actor_name, actor_initials, actor_email,
      field_name, old_value, new_value
    ) values (
      v_change_set_id, new.id, new.item_number, v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email,
      'item_number', old.item_number, new.item_number
    );
  end if;

  if old.item_text_da is distinct from new.item_text_da then
    insert into public.price_list_item_history (
      change_set_id, item_id, item_number, actor_user_id, actor_name, actor_initials, actor_email,
      field_name, old_value, new_value
    ) values (
      v_change_set_id, new.id, new.item_number, v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email,
      'item_text_da', old.item_text_da, new.item_text_da
    );
  end if;

  if old.item_text_de is distinct from new.item_text_de then
    insert into public.price_list_item_history (
      change_set_id, item_id, item_number, actor_user_id, actor_name, actor_initials, actor_email,
      field_name, old_value, new_value
    ) values (
      v_change_set_id, new.id, new.item_number, v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email,
      'item_text_de', old.item_text_de, new.item_text_de
    );
  end if;

  if old.item_text_en is distinct from new.item_text_en then
    insert into public.price_list_item_history (
      change_set_id, item_id, item_number, actor_user_id, actor_name, actor_initials, actor_email,
      field_name, old_value, new_value
    ) values (
      v_change_set_id, new.id, new.item_number, v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email,
      'item_text_en', old.item_text_en, new.item_text_en
    );
  end if;

  if old.cost_price_dkk is distinct from new.cost_price_dkk then
    insert into public.price_list_item_history (
      change_set_id, item_id, item_number, actor_user_id, actor_name, actor_initials, actor_email,
      field_name, old_value, new_value, old_numeric_value, new_numeric_value
    ) values (
      v_change_set_id, new.id, new.item_number, v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email,
      'cost_price_dkk', old.cost_price_dkk::text, new.cost_price_dkk::text, old.cost_price_dkk, new.cost_price_dkk
    );
  end if;

  if old.price_dkk is distinct from new.price_dkk then
    insert into public.price_list_item_history (
      change_set_id, item_id, item_number, actor_user_id, actor_name, actor_initials, actor_email,
      field_name, old_value, new_value, old_numeric_value, new_numeric_value
    ) values (
      v_change_set_id, new.id, new.item_number, v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email,
      'price_dkk', old.price_dkk::text, new.price_dkk::text, old.price_dkk, new.price_dkk
    );
  end if;

  if old.price_sek is distinct from new.price_sek then
    insert into public.price_list_item_history (
      change_set_id, item_id, item_number, actor_user_id, actor_name, actor_initials, actor_email,
      field_name, old_value, new_value, old_numeric_value, new_numeric_value
    ) values (
      v_change_set_id, new.id, new.item_number, v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email,
      'price_sek', old.price_sek::text, new.price_sek::text, old.price_sek, new.price_sek
    );
  end if;

  if old.price_eur is distinct from new.price_eur then
    insert into public.price_list_item_history (
      change_set_id, item_id, item_number, actor_user_id, actor_name, actor_initials, actor_email,
      field_name, old_value, new_value, old_numeric_value, new_numeric_value
    ) values (
      v_change_set_id, new.id, new.item_number, v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email,
      'price_eur', old.price_eur::text, new.price_eur::text, old.price_eur, new.price_eur
    );
  end if;

  return new;
end;
$$;

revoke all on function public.record_price_list_item_history() from public, anon, authenticated;

create or replace function public.publish_price_list_items(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item text;
  src public.price_list_items%rowtype;
  existed boolean;
  created_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  errors jsonb := '[]'::jsonb;
  item_numbers text[] := array[]::text[];
  current_email text := coalesce(auth.jwt() ->> 'email', null);
begin
  if not public.is_timan_backend() then
    raise exception 'Kun backend kan publicere prislister.' using errcode = '42501';
  end if;

  for item in select jsonb_array_elements_text(coalesce(payload -> 'item_numbers', '[]'::jsonb)) loop
    begin
      item_numbers := array_append(item_numbers, item);
      select * into src from public.price_list_items where item_number = item;
      if not found then
        skipped_count := skipped_count + 1;
        continue;
      end if;
      existed := exists(select 1 from public.price_list_published where item_number = item);

      insert into public.price_list_published (
        item_number, item_text_da, item_text_de, item_text_en,
        price_dkk, price_eur, price_sek,
        published_by, published_by_email, published_at
      ) values (
        src.item_number, src.item_text_da, src.item_text_de, src.item_text_en,
        src.price_dkk, src.price_eur, src.price_sek,
        auth.uid(), current_email, now()
      )
      on conflict (item_number) do update
      set item_text_da = coalesce(excluded.item_text_da, public.price_list_published.item_text_da),
          item_text_de = excluded.item_text_de,
          item_text_en = excluded.item_text_en,
          price_dkk = coalesce(excluded.price_dkk, public.price_list_published.price_dkk),
          price_eur = coalesce(excluded.price_eur, public.price_list_published.price_eur),
          price_sek = coalesce(excluded.price_sek, public.price_list_published.price_sek),
          published_by = excluded.published_by,
          published_by_email = excluded.published_by_email,
          published_at = excluded.published_at;

      update public.price_list_items
      set is_dirty = false, last_published_at = now()
      where item_number = item;

      if existed then updated_count := updated_count + 1; else created_count := created_count + 1; end if;
    exception when others then
      errors := errors || jsonb_build_array(jsonb_build_object('item_number', item, 'error', SQLERRM));
    end;
  end loop;

  insert into public.price_list_publish_logs (
    published_by, published_by_email, created_count, updated_count,
    skipped_count, error_count, item_numbers, errors
  ) values (
    auth.uid(), current_email, created_count, updated_count,
    skipped_count, jsonb_array_length(errors), item_numbers, errors
  );

  return jsonb_build_object(
    'created', created_count, 'updated', updated_count,
    'skipped', skipped_count, 'errors', errors
  );
end;
$$;

-- PostgreSQL cannot change a table function's result row type in place.
drop function if exists public.list_published_product_master();
create function public.list_published_product_master()
returns table(
  item_number text,
  item_text_da text,
  item_text_de text,
  item_text_en text,
  price_dkk numeric,
  price_eur numeric,
  price_sek numeric,
  identity_aliases text[],
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.item_number, p.item_text_da, p.item_text_de, p.item_text_en,
         p.price_dkk, p.price_eur, p.price_sek, p.identity_aliases, p.published_at
  from public.price_list_published p
  order by p.item_number;
$$;

revoke all on function public.list_published_product_master() from public, anon, authenticated;
grant execute on function public.list_published_product_master() to anon, authenticated;
