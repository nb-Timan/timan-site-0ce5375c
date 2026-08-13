-- Backend price list foundation, including backend-only cost prices.
-- Cost prices are stored in price_list_items and are protected by RLS + backend RPC checks.

create table if not exists public.price_list_items (
  id uuid primary key default gen_random_uuid(),
  item_number text not null unique,
  item_text_da text,
  price_dkk numeric,
  price_eur numeric,
  price_sek numeric,
  cost_price_dkk numeric,
  cost_price_source text,
  cost_price_updated_at timestamptz,
  updated_by uuid,
  updated_by_email text,
  updated_at timestamptz not null default now(),
  is_dirty boolean not null default false,
  last_published_at timestamptz
);

create table if not exists public.price_list_import_logs (
  id uuid primary key default gen_random_uuid(),
  imported_by uuid,
  imported_by_email text,
  imported_at timestamptz not null default now(),
  file_name text,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb
);

create table if not exists public.price_list_published (
  id uuid primary key default gen_random_uuid(),
  item_number text not null unique,
  item_text_da text,
  price_dkk numeric,
  price_eur numeric,
  price_sek numeric,
  published_by uuid,
  published_by_email text,
  published_at timestamptz not null default now()
);

create table if not exists public.price_list_publish_logs (
  id uuid primary key default gen_random_uuid(),
  published_by uuid,
  published_by_email text,
  published_at timestamptz not null default now(),
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  item_numbers text[],
  errors jsonb not null default '[]'::jsonb
);

alter table public.price_list_items enable row level security;
alter table public.price_list_import_logs enable row level security;
alter table public.price_list_published enable row level security;
alter table public.price_list_publish_logs enable row level security;

drop policy if exists "Backend can read price list items" on public.price_list_items;
create policy "Backend can read price list items"
on public.price_list_items
for select
to authenticated
using (public.is_timan_backend());

drop policy if exists "Backend can insert price list items" on public.price_list_items;
create policy "Backend can insert price list items"
on public.price_list_items
for insert
to authenticated
with check (public.is_timan_backend());

drop policy if exists "Backend can update price list items" on public.price_list_items;
create policy "Backend can update price list items"
on public.price_list_items
for update
to authenticated
using (public.is_timan_backend())
with check (public.is_timan_backend());

drop policy if exists "Backend can read price import logs" on public.price_list_import_logs;
create policy "Backend can read price import logs"
on public.price_list_import_logs
for select
to authenticated
using (public.is_timan_backend());

drop policy if exists "Backend can insert price import logs" on public.price_list_import_logs;
create policy "Backend can insert price import logs"
on public.price_list_import_logs
for insert
to authenticated
with check (public.is_timan_backend());

drop policy if exists "Backend can read published price list" on public.price_list_published;
create policy "Backend can read published price list"
on public.price_list_published
for select
to authenticated
using (public.is_timan_backend());

drop policy if exists "Backend can insert published price list" on public.price_list_published;
create policy "Backend can insert published price list"
on public.price_list_published
for insert
to authenticated
with check (public.is_timan_backend());

drop policy if exists "Backend can update published price list" on public.price_list_published;
create policy "Backend can update published price list"
on public.price_list_published
for update
to authenticated
using (public.is_timan_backend())
with check (public.is_timan_backend());

drop policy if exists "Backend can read price publish logs" on public.price_list_publish_logs;
create policy "Backend can read price publish logs"
on public.price_list_publish_logs
for select
to authenticated
using (public.is_timan_backend());

drop policy if exists "Backend can insert price publish logs" on public.price_list_publish_logs;
create policy "Backend can insert price publish logs"
on public.price_list_publish_logs
for insert
to authenticated
with check (public.is_timan_backend());

grant select, insert, update on public.price_list_items to authenticated;
grant select, insert on public.price_list_import_logs to authenticated;
grant select, insert, update on public.price_list_published to authenticated;
grant select, insert on public.price_list_publish_logs to authenticated;

create or replace function public.parse_price_number(value text)
returns numeric
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v text;
begin
  if value is null then
    return null;
  end if;

  v := regexp_replace(trim(value), '\s', '', 'g');
  if v = '' then
    return null;
  end if;

  if position(',' in v) > 0 and position('.' in v) > 0 then
    v := replace(replace(v, '.', ''), ',', '.');
  elsif position(',' in v) > 0 then
    v := replace(v, ',', '.');
  end if;

  return v::numeric;
exception when others then
  raise exception 'Ugyldigt tal: %', value using errcode = '22023';
end;
$$;

create or replace function public.upsert_price_list_items(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  existing public.price_list_items%rowtype;
  new_item_number text;
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
  errors jsonb := '[]'::jsonb;
  current_email text := coalesce(auth.jwt() ->> 'email', null);
begin
  if not public.is_timan_backend() then
    raise exception 'Kun backend kan importere prislister.' using errcode = '42501';
  end if;

  for r in select * from jsonb_array_elements(coalesce(payload -> 'rows', '[]'::jsonb)) loop
    begin
      new_item_number := nullif(trim(coalesce(r ->> 'item_number', '')), '');
      if new_item_number is null then
        raise exception 'Mangler varenr.';
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
          case when new_cost_price_dkk is null then null else coalesce(payload ->> 'file_name', 'import') end,
          case when new_cost_price_dkk is null then null else now() end,
          auth.uid(),
          current_email,
          now(),
          (new_item_text_da is not null or new_price_dkk is not null or new_price_eur is not null or new_price_sek is not null)
        );
        created_count := created_count + 1;
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
            cost_price_source = case when new_cost_price_dkk is null then cost_price_source else coalesce(payload ->> 'file_name', 'import') end,
            cost_price_updated_at = case when new_cost_price_dkk is null then cost_price_updated_at else now() end,
            updated_by = auth.uid(),
            updated_by_email = current_email,
            updated_at = now(),
            is_dirty = case when has_price_change then true else is_dirty end
          where item_number = new_item_number;
          updated_count := updated_count + 1;
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

  return jsonb_build_object(
    'created', created_count,
    'updated', updated_count,
    'skipped', skipped_count,
    'errors', errors
  );
end;
$$;

create or replace function public.update_price_list_item(
  p_item_number text,
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
  has_price_change boolean;
  has_cost_change boolean;
begin
  if not public.is_timan_backend() then
    raise exception 'Kun backend kan rette prislister.' using errcode = '42501';
  end if;

  select * into existing
  from public.price_list_items
  where item_number = p_item_number;

  if not found then
    raise exception 'Varenr findes ikke.' using errcode = 'P0002';
  end if;

  has_price_change :=
    p_item_text_da is distinct from existing.item_text_da
    or p_price_dkk is distinct from existing.price_dkk
    or p_price_eur is distinct from existing.price_eur
    or p_price_sek is distinct from existing.price_sek;

  has_cost_change := p_cost_price_dkk is distinct from existing.cost_price_dkk;

  update public.price_list_items
  set
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
  where item_number = p_item_number
  returning * into out_row;

  return out_row;
end;
$$;

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

      select * into src
      from public.price_list_items
      where item_number = item;

      if not found then
        skipped_count := skipped_count + 1;
        continue;
      end if;

      existed := exists(select 1 from public.price_list_published where item_number = item);

      insert into public.price_list_published (
        item_number,
        item_text_da,
        price_dkk,
        price_eur,
        price_sek,
        published_by,
        published_by_email,
        published_at
      )
      values (
        src.item_number,
        src.item_text_da,
        src.price_dkk,
        src.price_eur,
        src.price_sek,
        auth.uid(),
        current_email,
        now()
      )
      on conflict (item_number) do update
      set
        item_text_da = coalesce(excluded.item_text_da, public.price_list_published.item_text_da),
        price_dkk = coalesce(excluded.price_dkk, public.price_list_published.price_dkk),
        price_eur = coalesce(excluded.price_eur, public.price_list_published.price_eur),
        price_sek = coalesce(excluded.price_sek, public.price_list_published.price_sek),
        published_by = excluded.published_by,
        published_by_email = excluded.published_by_email,
        published_at = excluded.published_at;

      update public.price_list_items
      set is_dirty = false,
          last_published_at = now()
      where item_number = item;

      if existed then
        updated_count := updated_count + 1;
      else
        created_count := created_count + 1;
      end if;
    exception when others then
      errors := errors || jsonb_build_array(jsonb_build_object(
        'item_number', item,
        'error', SQLERRM
      ));
    end;
  end loop;

  insert into public.price_list_publish_logs (
    published_by,
    published_by_email,
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
    created_count,
    updated_count,
    skipped_count,
    jsonb_array_length(errors),
    item_numbers,
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

revoke all on function public.parse_price_number(text) from public, anon;
grant execute on function public.parse_price_number(text) to authenticated;

revoke all on function public.upsert_price_list_items(jsonb) from public, anon;
grant execute on function public.upsert_price_list_items(jsonb) to authenticated;

revoke all on function public.update_price_list_item(text, text, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.update_price_list_item(text, text, numeric, numeric, numeric, numeric) to authenticated;

revoke all on function public.publish_price_list_items(jsonb) from public, anon;
grant execute on function public.publish_price_list_items(jsonb) to authenticated;
