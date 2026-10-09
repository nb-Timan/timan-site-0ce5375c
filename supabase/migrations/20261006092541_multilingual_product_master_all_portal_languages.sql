-- Complete Product Master language coverage for the nine portal languages.
-- Existing DA/EN/DE values and every commercial/historical snapshot are kept.

alter table public.price_list_items
  add column if not exists item_text_it text,
  add column if not exists item_text_hu text,
  add column if not exists item_text_sv text,
  add column if not exists item_text_fr text,
  add column if not exists item_text_pl text,
  add column if not exists item_text_cs text;

alter table public.price_list_published
  add column if not exists item_text_it text,
  add column if not exists item_text_hu text,
  add column if not exists item_text_sv text,
  add column if not exists item_text_fr text,
  add column if not exists item_text_pl text,
  add column if not exists item_text_cs text;

alter table public.price_list_release_items
  add column if not exists item_text_it text,
  add column if not exists item_text_hu text,
  add column if not exists item_text_sv text,
  add column if not exists item_text_fr text,
  add column if not exists item_text_pl text,
  add column if not exists item_text_cs text;

alter table public.price_list_item_history
  drop constraint if exists price_list_item_history_field_name_check;

alter table public.price_list_item_history
  add constraint price_list_item_history_field_name_check
  check (field_name in (
    'item_number',
    'item_text_da', 'item_text_en', 'item_text_de', 'item_text_it', 'item_text_hu',
    'item_text_sv', 'item_text_fr', 'item_text_pl', 'item_text_cs',
    'cost_price_dkk', 'price_dkk', 'price_sek', 'price_eur'
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
  v_field text;
begin
  if old.item_number is not distinct from new.item_number
    and old.item_text_da is not distinct from new.item_text_da
    and old.item_text_en is not distinct from new.item_text_en
    and old.item_text_de is not distinct from new.item_text_de
    and old.item_text_it is not distinct from new.item_text_it
    and old.item_text_hu is not distinct from new.item_text_hu
    and old.item_text_sv is not distinct from new.item_text_sv
    and old.item_text_fr is not distinct from new.item_text_fr
    and old.item_text_pl is not distinct from new.item_text_pl
    and old.item_text_cs is not distinct from new.item_text_cs
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

  foreach v_field in array array[
    'item_number',
    'item_text_da', 'item_text_en', 'item_text_de', 'item_text_it', 'item_text_hu',
    'item_text_sv', 'item_text_fr', 'item_text_pl', 'item_text_cs'
  ] loop
    if to_jsonb(old) ->> v_field is distinct from to_jsonb(new) ->> v_field then
      insert into public.price_list_item_history (
        change_set_id, item_id, item_number, actor_user_id, actor_name, actor_initials, actor_email,
        field_name, old_value, new_value
      ) values (
        v_change_set_id, new.id, new.item_number, v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email,
        v_field, to_jsonb(old) ->> v_field, to_jsonb(new) ->> v_field
      );
    end if;
  end loop;

  foreach v_field in array array['cost_price_dkk', 'price_dkk', 'price_sek', 'price_eur'] loop
    if to_jsonb(old) ->> v_field is distinct from to_jsonb(new) ->> v_field then
      insert into public.price_list_item_history (
        change_set_id, item_id, item_number, actor_user_id, actor_name, actor_initials, actor_email,
        field_name, old_value, new_value, old_numeric_value, new_numeric_value
      ) values (
        v_change_set_id, new.id, new.item_number, v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email,
        v_field, to_jsonb(old) ->> v_field, to_jsonb(new) ->> v_field,
        (to_jsonb(old) ->> v_field)::numeric, (to_jsonb(new) ->> v_field)::numeric
      );
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.record_price_list_item_history() from public, anon, authenticated;

-- New overload; the previous three-language signature remains available to
-- browser sessions that were opened before this deployment.
create or replace function public.update_price_list_item(
  p_item_number text,
  p_new_item_number text,
  p_item_text_da text,
  p_item_text_en text,
  p_item_text_de text,
  p_item_text_it text,
  p_item_text_hu text,
  p_item_text_sv text,
  p_item_text_fr text,
  p_item_text_pl text,
  p_item_text_cs text,
  p_price_dkk numeric,
  p_price_eur numeric,
  p_price_sek numeric,
  p_cost_price_dkk numeric default null
)
returns public.price_list_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  out_row public.price_list_items;
  existing public.price_list_items%rowtype;
  source_item_number text := nullif(btrim(p_item_number), '');
  target_item_number text := coalesce(nullif(btrim(p_new_item_number), ''), nullif(btrim(p_item_number), ''));
  has_published_change boolean;
  has_cost_change boolean;
begin
  if not public.is_timan_backend() then
    raise exception 'Kun backend kan rette prislister.' using errcode = '42501';
  end if;
  if source_item_number is null or target_item_number is null then
    raise exception 'Varenr mangler.' using errcode = '22023';
  end if;

  select * into existing from public.price_list_items
  where item_number = source_item_number or renamed_from_item_number = source_item_number;

  if not found then
    insert into public.price_list_items (
      item_number, renamed_from_item_number,
      item_text_da, item_text_en, item_text_de, item_text_it, item_text_hu,
      item_text_sv, item_text_fr, item_text_pl, item_text_cs,
      price_dkk, price_eur, price_sek, cost_price_dkk,
      cost_price_source, cost_price_updated_at,
      updated_by, updated_by_email, updated_at, is_dirty
    ) values (
      target_item_number,
      case when target_item_number is distinct from source_item_number then source_item_number else null end,
      p_item_text_da, p_item_text_en, p_item_text_de, p_item_text_it, p_item_text_hu,
      p_item_text_sv, p_item_text_fr, p_item_text_pl, p_item_text_cs,
      p_price_dkk, p_price_eur, p_price_sek, p_cost_price_dkk,
      case when p_cost_price_dkk is null then null else 'manual' end,
      case when p_cost_price_dkk is null then null else now() end,
      auth.uid(), coalesce(auth.jwt() ->> 'email', null), now(), true
    ) returning * into out_row;
    return out_row;
  end if;

  has_published_change :=
    target_item_number is distinct from existing.item_number
    or p_item_text_da is distinct from existing.item_text_da
    or p_item_text_en is distinct from existing.item_text_en
    or p_item_text_de is distinct from existing.item_text_de
    or p_item_text_it is distinct from existing.item_text_it
    or p_item_text_hu is distinct from existing.item_text_hu
    or p_item_text_sv is distinct from existing.item_text_sv
    or p_item_text_fr is distinct from existing.item_text_fr
    or p_item_text_pl is distinct from existing.item_text_pl
    or p_item_text_cs is distinct from existing.item_text_cs
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
      item_text_en = p_item_text_en,
      item_text_de = p_item_text_de,
      item_text_it = p_item_text_it,
      item_text_hu = p_item_text_hu,
      item_text_sv = p_item_text_sv,
      item_text_fr = p_item_text_fr,
      item_text_pl = p_item_text_pl,
      item_text_cs = p_item_text_cs,
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
  text, text, text, text, text, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric
) from public, anon;
grant execute on function public.update_price_list_item(
  text, text, text, text, text, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric
) to authenticated;

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
  import_mode text := nullif(btrim(coalesce(payload ->> 'import_mode', '')), '');
  machine_scope text := coalesce(nullif(btrim(coalesce(payload ->> 'machine_scope', '')), ''), 'all');
  source_file_name text := nullif(btrim(coalesce(payload ->> 'file_name', '')), '');
  new_item_number text;
  catalog_source text;
  t_da text; t_en text; t_de text; t_it text; t_hu text;
  t_sv text; t_fr text; t_pl text; t_cs text;
  new_price_dkk numeric; new_price_eur numeric; new_price_sek numeric; new_cost_price_dkk numeric;
  has_price_change boolean; has_cost_change boolean;
  created_count integer := 0; updated_count integer := 0; skipped_count integer := 0;
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
      new_item_number := nullif(btrim(coalesce(r ->> 'item_number', '')), '');
      if new_item_number is null then raise exception 'Mangler varenr.'; end if;
      if new_item_number = any(seen_item_numbers) then raise exception 'Duplikeret varenr. i importen.'; end if;
      seen_item_numbers := array_append(seen_item_numbers, new_item_number);

      if import_mode = 'COST_ONLY' then
        new_cost_price_dkk := public.parse_price_number(r ->> 'cost_price_dkk');
        catalog_source := nullif(btrim(coalesce(r ->> 'catalog_source', '')), '');
        select * into existing from public.price_list_items where item_number = new_item_number;

        if not found then
          select * into canonical_product from public.price_list_published where item_number = new_item_number;
          if not found and catalog_source is distinct from 'CANONICAL_CONFIGURATOR' then
            raise exception 'Varenr. findes ikke i det canonical produktkatalog. Kostprisimport opretter aldrig nye produkter.';
          end if;
          if new_cost_price_dkk is null then skipped_count := skipped_count + 1; continue; end if;
          insert into public.price_list_items (
            item_number, cost_price_dkk, cost_price_source, cost_price_updated_at,
            updated_by, updated_by_email, updated_at, is_dirty, last_published_at
          ) values (
            new_item_number, new_cost_price_dkk, coalesce(source_file_name, 'cost-only import'), now(),
            auth.uid(), current_email, now(), false,
            case when canonical_product.item_number is null then null else canonical_product.published_at end
          );
          updated_count := updated_count + 1;
          changed_item_numbers := array_append(changed_item_numbers, new_item_number);
          continue;
        end if;

        if new_cost_price_dkk is null or new_cost_price_dkk is not distinct from existing.cost_price_dkk then
          skipped_count := skipped_count + 1; continue;
        end if;
        update public.price_list_items
        set cost_price_dkk = new_cost_price_dkk,
            cost_price_source = coalesce(source_file_name, 'cost-only import'),
            cost_price_updated_at = now(), updated_by = auth.uid(),
            updated_by_email = current_email, updated_at = now()
        where item_number = new_item_number;
        updated_count := updated_count + 1;
        changed_item_numbers := array_append(changed_item_numbers, new_item_number);
        continue;
      end if;

      t_da := nullif(btrim(coalesce(r ->> 'item_text_da', '')), '');
      t_en := nullif(btrim(coalesce(r ->> 'item_text_en', '')), '');
      t_de := nullif(btrim(coalesce(r ->> 'item_text_de', '')), '');
      t_it := nullif(btrim(coalesce(r ->> 'item_text_it', '')), '');
      t_hu := nullif(btrim(coalesce(r ->> 'item_text_hu', '')), '');
      t_sv := nullif(btrim(coalesce(r ->> 'item_text_sv', '')), '');
      t_fr := nullif(btrim(coalesce(r ->> 'item_text_fr', '')), '');
      t_pl := nullif(btrim(coalesce(r ->> 'item_text_pl', '')), '');
      t_cs := nullif(btrim(coalesce(r ->> 'item_text_cs', '')), '');
      new_price_dkk := public.parse_price_number(r ->> 'price_dkk');
      new_price_eur := public.parse_price_number(r ->> 'price_eur');
      new_price_sek := public.parse_price_number(r ->> 'price_sek');
      new_cost_price_dkk := public.parse_price_number(r ->> 'cost_price_dkk');

      select * into existing from public.price_list_items where item_number = new_item_number;
      if not found then
        insert into public.price_list_items (
          item_number,
          item_text_da, item_text_en, item_text_de, item_text_it, item_text_hu,
          item_text_sv, item_text_fr, item_text_pl, item_text_cs,
          price_dkk, price_eur, price_sek, cost_price_dkk,
          cost_price_source, cost_price_updated_at,
          updated_by, updated_by_email, updated_at, is_dirty
        ) values (
          new_item_number,
          t_da, t_en, t_de, t_it, t_hu, t_sv, t_fr, t_pl, t_cs,
          new_price_dkk, new_price_eur, new_price_sek, new_cost_price_dkk,
          case when new_cost_price_dkk is null then null else coalesce(source_file_name, 'full price-list import') end,
          case when new_cost_price_dkk is null then null else now() end,
          auth.uid(), current_email, now(),
          (t_da is not null or t_en is not null or t_de is not null or t_it is not null or t_hu is not null
            or t_sv is not null or t_fr is not null or t_pl is not null or t_cs is not null
            or new_price_dkk is not null or new_price_eur is not null or new_price_sek is not null)
        );
        created_count := created_count + 1;
        changed_item_numbers := array_append(changed_item_numbers, new_item_number);
      else
        has_price_change :=
          (t_da is not null and t_da is distinct from existing.item_text_da)
          or (t_en is not null and t_en is distinct from existing.item_text_en)
          or (t_de is not null and t_de is distinct from existing.item_text_de)
          or (t_it is not null and t_it is distinct from existing.item_text_it)
          or (t_hu is not null and t_hu is distinct from existing.item_text_hu)
          or (t_sv is not null and t_sv is distinct from existing.item_text_sv)
          or (t_fr is not null and t_fr is distinct from existing.item_text_fr)
          or (t_pl is not null and t_pl is distinct from existing.item_text_pl)
          or (t_cs is not null and t_cs is distinct from existing.item_text_cs)
          or (new_price_dkk is not null and new_price_dkk is distinct from existing.price_dkk)
          or (new_price_eur is not null and new_price_eur is distinct from existing.price_eur)
          or (new_price_sek is not null and new_price_sek is distinct from existing.price_sek);
        has_cost_change := new_cost_price_dkk is not null and new_cost_price_dkk is distinct from existing.cost_price_dkk;

        if has_price_change or has_cost_change then
          update public.price_list_items
          set item_text_da = coalesce(t_da, item_text_da),
              item_text_en = coalesce(t_en, item_text_en),
              item_text_de = coalesce(t_de, item_text_de),
              item_text_it = coalesce(t_it, item_text_it),
              item_text_hu = coalesce(t_hu, item_text_hu),
              item_text_sv = coalesce(t_sv, item_text_sv),
              item_text_fr = coalesce(t_fr, item_text_fr),
              item_text_pl = coalesce(t_pl, item_text_pl),
              item_text_cs = coalesce(t_cs, item_text_cs),
              price_dkk = coalesce(new_price_dkk, price_dkk),
              price_eur = coalesce(new_price_eur, price_eur),
              price_sek = coalesce(new_price_sek, price_sek),
              cost_price_dkk = coalesce(new_cost_price_dkk, cost_price_dkk),
              cost_price_source = case when new_cost_price_dkk is null then cost_price_source else coalesce(source_file_name, 'full price-list import') end,
              cost_price_updated_at = case when new_cost_price_dkk is null then cost_price_updated_at else now() end,
              updated_by = auth.uid(), updated_by_email = current_email, updated_at = now(),
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
        'item_number', coalesce(new_item_number, r ->> 'item_number'), 'error', sqlerrm
      ));
    end;
  end loop;

  insert into public.price_list_import_logs (
    imported_by, imported_by_email, file_name, import_mode, machine_scope,
    processed_count, created_count, updated_count, skipped_count, error_count,
    item_numbers, errors
  ) values (
    auth.uid(), current_email, source_file_name, import_mode, machine_scope,
    processed_count, created_count, updated_count, skipped_count, jsonb_array_length(errors),
    changed_item_numbers, errors
  );

  return jsonb_build_object(
    'created', created_count, 'updated', updated_count,
    'skipped', skipped_count, 'errors', errors
  );
end;
$$;

revoke all on function public.upsert_price_list_items(jsonb) from public, anon;
grant execute on function public.upsert_price_list_items(jsonb) to authenticated;

create or replace function public.release_price_list_items(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_items text[];
  selected_items text[];
  previous_release public.price_list_releases%rowtype;
  release_row public.price_list_releases%rowtype;
  source_log public.price_list_import_logs%rowtype;
  changed_currencies text[] := array[]::text[];
  selected_count integer := 0;
  created_count integer := 0;
  updated_count integer := 0;
  current_email text := coalesce(auth.jwt() ->> 'email', null);
  release_time timestamptz := now();
begin
  if not public.is_timan_backend() then
    raise exception 'Kun backend kan frigive prislister.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct nullif(btrim(value), '')), array[]::text[])
  into requested_items
  from jsonb_array_elements_text(coalesce(payload -> 'item_numbers', '[]'::jsonb)) as requested(value);
  requested_items := array_remove(requested_items, null);
  if cardinality(requested_items) = 0 then
    raise exception 'Ingen varer valgt til frigivelse.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('timan-price-list-release'));
  perform 1 from public.price_list_items where item_number = any(requested_items) for update;

  select array_agg(item_number order by item_number), count(*)
  into selected_items, selected_count
  from public.price_list_items
  where item_number = any(requested_items) and is_dirty = true;
  if selected_count <> cardinality(requested_items) then
    raise exception 'Alle valgte varer skal findes og være klargjort før frigivelse.' using errcode = '22023';
  end if;

  select * into previous_release from public.price_list_releases
  where status = 'RELEASED' order by version_number desc limit 1 for update;
  select * into source_log from public.price_list_import_logs
  where import_mode = 'FULL_PRICE_LIST' and item_numbers && selected_items
  order by imported_at desc limit 1;

  select coalesce(array_agg(currency order by currency), array[]::text[])
  into changed_currencies
  from (
    select 'DKK'::text as currency where exists (
      select 1 from public.price_list_items s left join public.price_list_published p using (item_number)
      where s.item_number = any(selected_items) and s.price_dkk is distinct from p.price_dkk
    )
    union all
    select 'EUR'::text where exists (
      select 1 from public.price_list_items s left join public.price_list_published p using (item_number)
      where s.item_number = any(selected_items) and s.price_eur is distinct from p.price_eur
    )
    union all
    select 'SEK'::text where exists (
      select 1 from public.price_list_items s left join public.price_list_published p using (item_number)
      where s.item_number = any(selected_items) and s.price_sek is distinct from p.price_sek
    )
  ) currencies;

  insert into public.price_list_releases (
    status, source_file_name, machine_scope, created_by, created_by_email,
    previous_release_id, affected_item_count, changed_currencies
  ) values (
    'STAGED', source_log.file_name, coalesce(source_log.machine_scope, 'all'),
    auth.uid(), current_email, previous_release.id, selected_count, changed_currencies
  ) returning * into release_row;

  insert into public.price_list_release_items (
    release_id, item_number,
    item_text_da, item_text_en, item_text_de, item_text_it, item_text_hu,
    item_text_sv, item_text_fr, item_text_pl, item_text_cs,
    identity_aliases, price_dkk, price_eur, price_sek, is_changed
  )
  select release_row.id, p.item_number,
         p.item_text_da, p.item_text_en, p.item_text_de, p.item_text_it, p.item_text_hu,
         p.item_text_sv, p.item_text_fr, p.item_text_pl, p.item_text_cs,
         coalesce(p.identity_aliases, array[]::text[]),
         p.price_dkk, p.price_eur, p.price_sek, false
  from public.price_list_published p
  where not (p.item_number = any(selected_items));

  insert into public.price_list_release_items (
    release_id, item_number,
    item_text_da, item_text_en, item_text_de, item_text_it, item_text_hu,
    item_text_sv, item_text_fr, item_text_pl, item_text_cs,
    identity_aliases, price_dkk, price_eur, price_sek, is_changed
  )
  select release_row.id, s.item_number,
         coalesce(s.item_text_da, p.item_text_da),
         coalesce(s.item_text_en, p.item_text_en),
         coalesce(s.item_text_de, p.item_text_de),
         coalesce(s.item_text_it, p.item_text_it),
         coalesce(s.item_text_hu, p.item_text_hu),
         coalesce(s.item_text_sv, p.item_text_sv),
         coalesce(s.item_text_fr, p.item_text_fr),
         coalesce(s.item_text_pl, p.item_text_pl),
         coalesce(s.item_text_cs, p.item_text_cs),
         coalesce(p.identity_aliases, array[]::text[]),
         coalesce(s.price_dkk, p.price_dkk), coalesce(s.price_eur, p.price_eur),
         coalesce(s.price_sek, p.price_sek), true
  from public.price_list_items s
  left join public.price_list_published p using (item_number)
  where s.item_number = any(selected_items);

  select count(*) filter (where p.item_number is null),
         count(*) filter (where p.item_number is not null)
  into created_count, updated_count
  from unnest(selected_items) selected(item_number)
  left join public.price_list_published p using (item_number);

  insert into public.price_list_published (
    item_number,
    item_text_da, item_text_en, item_text_de, item_text_it, item_text_hu,
    item_text_sv, item_text_fr, item_text_pl, item_text_cs,
    price_dkk, price_eur, price_sek,
    published_by, published_by_email, published_at
  )
  select s.item_number,
         s.item_text_da, s.item_text_en, s.item_text_de, s.item_text_it, s.item_text_hu,
         s.item_text_sv, s.item_text_fr, s.item_text_pl, s.item_text_cs,
         s.price_dkk, s.price_eur, s.price_sek,
         auth.uid(), current_email, release_time
  from public.price_list_items s
  where s.item_number = any(selected_items)
  on conflict (item_number) do update
  set item_text_da = coalesce(excluded.item_text_da, public.price_list_published.item_text_da),
      item_text_en = coalesce(excluded.item_text_en, public.price_list_published.item_text_en),
      item_text_de = coalesce(excluded.item_text_de, public.price_list_published.item_text_de),
      item_text_it = coalesce(excluded.item_text_it, public.price_list_published.item_text_it),
      item_text_hu = coalesce(excluded.item_text_hu, public.price_list_published.item_text_hu),
      item_text_sv = coalesce(excluded.item_text_sv, public.price_list_published.item_text_sv),
      item_text_fr = coalesce(excluded.item_text_fr, public.price_list_published.item_text_fr),
      item_text_pl = coalesce(excluded.item_text_pl, public.price_list_published.item_text_pl),
      item_text_cs = coalesce(excluded.item_text_cs, public.price_list_published.item_text_cs),
      price_dkk = coalesce(excluded.price_dkk, public.price_list_published.price_dkk),
      price_eur = coalesce(excluded.price_eur, public.price_list_published.price_eur),
      price_sek = coalesce(excluded.price_sek, public.price_list_published.price_sek),
      published_by = excluded.published_by,
      published_by_email = excluded.published_by_email,
      published_at = excluded.published_at;

  update public.price_list_items set is_dirty = false, last_published_at = release_time
  where item_number = any(selected_items);
  if previous_release.id is not null then
    update public.price_list_releases set status = 'SUPERSEDED', superseded_at = release_time
    where id = previous_release.id;
  end if;
  update public.price_list_releases
  set status = 'RELEASED', released_by = auth.uid(), released_by_email = current_email,
      released_at = release_time, effective_at = release_time
  where id = release_row.id returning * into release_row;

  insert into public.price_list_publish_logs (
    published_by, published_by_email, published_at,
    created_count, updated_count, skipped_count, error_count,
    item_numbers, errors, release_id, version_number, effective_at, changed_currencies
  ) values (
    auth.uid(), current_email, release_time,
    created_count, updated_count, 0, 0, selected_items, '[]'::jsonb,
    release_row.id, release_row.version_number, release_time, changed_currencies
  );

  return jsonb_build_object(
    'created', created_count, 'updated', updated_count, 'skipped', 0,
    'errors', '[]'::jsonb, 'release_id', release_row.id,
    'version_number', release_row.version_number, 'effective_at', release_time,
    'affected_item_count', selected_count, 'changed_currencies', changed_currencies
  );
end;
$$;

revoke all on function public.release_price_list_items(jsonb) from public, anon;
grant execute on function public.release_price_list_items(jsonb) to authenticated;

-- Keep the legacy publish endpoint safe for older open browser sessions while
-- carrying every canonical portal-language value forward independently.
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
        item_number,
        item_text_da, item_text_en, item_text_de, item_text_it, item_text_hu,
        item_text_sv, item_text_fr, item_text_pl, item_text_cs,
        price_dkk, price_eur, price_sek,
        published_by, published_by_email, published_at
      ) values (
        src.item_number,
        src.item_text_da, src.item_text_en, src.item_text_de, src.item_text_it, src.item_text_hu,
        src.item_text_sv, src.item_text_fr, src.item_text_pl, src.item_text_cs,
        src.price_dkk, src.price_eur, src.price_sek,
        auth.uid(), current_email, now()
      )
      on conflict (item_number) do update
      set item_text_da = coalesce(excluded.item_text_da, public.price_list_published.item_text_da),
          item_text_en = coalesce(excluded.item_text_en, public.price_list_published.item_text_en),
          item_text_de = coalesce(excluded.item_text_de, public.price_list_published.item_text_de),
          item_text_it = coalesce(excluded.item_text_it, public.price_list_published.item_text_it),
          item_text_hu = coalesce(excluded.item_text_hu, public.price_list_published.item_text_hu),
          item_text_sv = coalesce(excluded.item_text_sv, public.price_list_published.item_text_sv),
          item_text_fr = coalesce(excluded.item_text_fr, public.price_list_published.item_text_fr),
          item_text_pl = coalesce(excluded.item_text_pl, public.price_list_published.item_text_pl),
          item_text_cs = coalesce(excluded.item_text_cs, public.price_list_published.item_text_cs),
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

revoke all on function public.publish_price_list_items(jsonb) from public, anon;
grant execute on function public.publish_price_list_items(jsonb) to authenticated;

-- Product Master remains the canonical current title source. Prices still come
-- exclusively from the controlled published price table.
drop function if exists public.list_published_product_master();
create function public.list_published_product_master()
returns table(
  item_number text,
  item_text_da text,
  item_text_en text,
  item_text_de text,
  item_text_it text,
  item_text_hu text,
  item_text_sv text,
  item_text_fr text,
  item_text_pl text,
  item_text_cs text,
  price_dkk numeric,
  price_eur numeric,
  price_sek numeric,
  identity_aliases text[],
  published_at timestamptz,
  is_active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    published.item_number,
    coalesce(current_item.item_text_da, published.item_text_da),
    case when current_item.item_number is not null then current_item.item_text_en else published.item_text_en end,
    case when current_item.item_number is not null then current_item.item_text_de else published.item_text_de end,
    case when current_item.item_number is not null then current_item.item_text_it else published.item_text_it end,
    case when current_item.item_number is not null then current_item.item_text_hu else published.item_text_hu end,
    case when current_item.item_number is not null then current_item.item_text_sv else published.item_text_sv end,
    case when current_item.item_number is not null then current_item.item_text_fr else published.item_text_fr end,
    case when current_item.item_number is not null then current_item.item_text_pl else published.item_text_pl end,
    case when current_item.item_number is not null then current_item.item_text_cs else published.item_text_cs end,
    published.price_dkk,
    published.price_eur,
    published.price_sek,
    array(
      select distinct alias
      from unnest(
        coalesce(published.identity_aliases, '{}'::text[])
        || array[
          published.item_text_da, published.item_text_en, published.item_text_de,
          published.item_text_it, published.item_text_hu, published.item_text_sv,
          published.item_text_fr, published.item_text_pl, published.item_text_cs,
          current_item.item_text_da, current_item.item_text_en, current_item.item_text_de,
          current_item.item_text_it, current_item.item_text_hu, current_item.item_text_sv,
          current_item.item_text_fr, current_item.item_text_pl, current_item.item_text_cs
        ]
      ) as alias
      where nullif(btrim(alias), '') is not null
    ),
    published.published_at,
    coalesce(current_item.is_active, true)
  from public.price_list_published as published
  left join public.price_list_items as current_item
    on current_item.item_number = published.item_number
  order by published.item_number;
$$;

revoke all on function public.list_published_product_master() from public, anon, authenticated;
grant execute on function public.list_published_product_master() to anon, authenticated;

-- Presentation publishing promotes each exact localized title to Product
-- Master. Shared media stays shared; descriptions/features/specs stay in the
-- presentation JSON with their language maps.
create or replace function public.publish_marketing_configurator_product_content(
  p_product_key text,
  p_machine_key text,
  p_item_number text,
  p_content jsonb
)
returns setof public.marketing_configurator_product_content
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_item_number text := nullif(btrim(p_item_number), '');
  v_title_da text := nullif(btrim(p_content #>> '{localized_titles,da}'), '');
  v_title_en text := nullif(btrim(p_content #>> '{localized_titles,en}'), '');
  v_title_de text := nullif(btrim(p_content #>> '{localized_titles,de}'), '');
  v_title_it text := nullif(btrim(p_content #>> '{localized_titles,it}'), '');
  v_title_hu text := nullif(btrim(p_content #>> '{localized_titles,hu}'), '');
  v_title_sv text := nullif(btrim(p_content #>> '{localized_titles,sv}'), '');
  v_title_fr text := nullif(btrim(p_content #>> '{localized_titles,fr}'), '');
  v_title_pl text := nullif(btrim(p_content #>> '{localized_titles,pl}'), '');
  v_title_cs text := nullif(btrim(p_content #>> '{localized_titles,cs}'), '');
  v_titles jsonb;
  v_content jsonb;
  v_product public.price_list_items%rowtype;
  v_row public.marketing_configurator_product_content%rowtype;
begin
  if not public.can_manage_marketing_configurator_content() then
    raise exception 'Kun autoriserede Marketing- og Backend-brugere kan publicere produktindhold.' using errcode = '42501';
  end if;

  if nullif(btrim(p_product_key), '') is null
    or nullif(btrim(p_machine_key), '') is null
    or v_item_number is null
    or v_title_da is null then
    raise exception 'Produkt, varenummer og dansk titel er påkrævet.' using errcode = '22023';
  end if;

  select * into v_product
  from public.price_list_items
  where item_number = v_item_number;
  if not found then
    raise exception 'Varenr. % findes ikke i Product Master.', v_item_number using errcode = 'P0002';
  end if;

  -- Older open clients only send DA/DE/EN. Missing keys preserve the current
  -- canonical value; an explicit empty value remains an intentional empty field.
  if not (coalesce(p_content #> '{localized_titles}', '{}'::jsonb) ? 'en') then v_title_en := v_product.item_text_en; end if;
  if not (coalesce(p_content #> '{localized_titles}', '{}'::jsonb) ? 'de') then v_title_de := v_product.item_text_de; end if;
  if not (coalesce(p_content #> '{localized_titles}', '{}'::jsonb) ? 'it') then v_title_it := v_product.item_text_it; end if;
  if not (coalesce(p_content #> '{localized_titles}', '{}'::jsonb) ? 'hu') then v_title_hu := v_product.item_text_hu; end if;
  if not (coalesce(p_content #> '{localized_titles}', '{}'::jsonb) ? 'sv') then v_title_sv := v_product.item_text_sv; end if;
  if not (coalesce(p_content #> '{localized_titles}', '{}'::jsonb) ? 'fr') then v_title_fr := v_product.item_text_fr; end if;
  if not (coalesce(p_content #> '{localized_titles}', '{}'::jsonb) ? 'pl') then v_title_pl := v_product.item_text_pl; end if;
  if not (coalesce(p_content #> '{localized_titles}', '{}'::jsonb) ? 'cs') then v_title_cs := v_product.item_text_cs; end if;

  v_titles := jsonb_build_object(
    'da', v_title_da, 'en', coalesce(v_title_en, ''), 'de', coalesce(v_title_de, ''),
    'it', coalesce(v_title_it, ''), 'hu', coalesce(v_title_hu, ''),
    'sv', coalesce(v_title_sv, ''), 'fr', coalesce(v_title_fr, ''),
    'pl', coalesce(v_title_pl, ''), 'cs', coalesce(v_title_cs, '')
  );
  v_content := jsonb_set(
    jsonb_set(coalesce(p_content, '{}'::jsonb), '{localized_titles}', v_titles, true),
    '{title}', to_jsonb(v_title_da), true
  );

  update public.price_list_items
  set item_text_da = v_title_da,
      item_text_en = v_title_en,
      item_text_de = v_title_de,
      item_text_it = v_title_it,
      item_text_hu = v_title_hu,
      item_text_sv = v_title_sv,
      item_text_fr = v_title_fr,
      item_text_pl = v_title_pl,
      item_text_cs = v_title_cs,
      updated_by = auth.uid(),
      updated_by_email = coalesce(auth.jwt() ->> 'email', updated_by_email),
      updated_at = now()
  where item_number = v_item_number;

  select au.id
  into v_actor_id
  from public.app_users as au
  where au.auth_user_id = auth.uid()
  limit 1;

  insert into public.marketing_configurator_product_content (
    product_key, machine_key, item_number, content, status,
    created_by, updated_by, published_at, updated_at
  ) values (
    btrim(p_product_key), btrim(p_machine_key), v_item_number, v_content, 'published',
    v_actor_id, v_actor_id, now(), now()
  )
  on conflict (product_key, status) do update
  set machine_key = excluded.machine_key,
      item_number = excluded.item_number,
      content = excluded.content,
      updated_by = excluded.updated_by,
      published_at = excluded.published_at,
      updated_at = excluded.updated_at
  returning * into v_row;

  delete from public.marketing_configurator_product_content
  where product_key = btrim(p_product_key)
    and status = 'draft';

  return next v_row;
end;
$$;

revoke all on function public.publish_marketing_configurator_product_content(
  text, text, text, jsonb
) from public, anon;
grant execute on function public.publish_marketing_configurator_product_content(
  text, text, text, jsonb
) to authenticated;

-- SKU 712578 was present in the canonical Configurator catalogue but missing
-- from Product Master. Seed only verified titles; no price is copied or changed.
insert into public.price_list_items (
  item_number, item_text_da, item_text_en, item_text_de, item_text_it, item_text_hu,
  is_active, is_dirty, updated_at
) values (
  '712578',
  'LED Rotorblink til tag med blitz lys',
  'LED Beacon for roof with Flashing Light',
  'LED-Rundumleuchte für Dach mit Blitzlicht',
  'Lampeggiante LED per tetto con luce stroboscopica',
  'LED villogó jelzőlámpa villanófényes tetőhöz',
  true, false, now()
)
on conflict (item_number) do nothing;

insert into public.price_list_published (
  item_number, item_text_da, item_text_en, item_text_de, item_text_it, item_text_hu,
  identity_aliases, published_at
)
select
  item_number, item_text_da, item_text_en, item_text_de, item_text_it, item_text_hu,
  array_remove(array[item_text_da, item_text_en, item_text_de, item_text_it, item_text_hu], null),
  now()
from public.price_list_items
where item_number = '712578'
on conflict (item_number) do nothing;
