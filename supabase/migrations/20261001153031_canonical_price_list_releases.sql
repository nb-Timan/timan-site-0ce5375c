-- Canonical released price-list lifecycle.
-- price_list_items remains the backend-only staged workspace. A release creates
-- a complete immutable snapshot while price_list_published remains the compact
-- current read model consumed by Configurator, quotes, orders and Support.

create table if not exists public.price_list_releases (
  id uuid primary key default gen_random_uuid(),
  version_number bigint generated always as identity unique,
  status text not null default 'STAGED'
    check (status in ('STAGED', 'RELEASED', 'SUPERSEDED')),
  source_file_name text,
  import_mode text not null default 'FULL_PRICE_LIST'
    check (import_mode = 'FULL_PRICE_LIST'),
  machine_scope text not null default 'all',
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  released_by uuid,
  released_by_email text,
  released_at timestamptz,
  effective_at timestamptz,
  superseded_at timestamptz,
  previous_release_id uuid references public.price_list_releases(id),
  affected_item_count integer not null default 0 check (affected_item_count >= 0),
  changed_currencies text[] not null default array[]::text[],
  constraint price_list_releases_released_metadata check (
    status = 'STAGED'
    or (released_at is not null and effective_at is not null)
  )
);

create table if not exists public.price_list_release_items (
  release_id uuid not null references public.price_list_releases(id),
  item_number text not null,
  item_text_da text,
  item_text_de text,
  item_text_en text,
  identity_aliases text[] not null default array[]::text[],
  price_dkk numeric,
  price_eur numeric,
  price_sek numeric,
  is_changed boolean not null default false,
  primary key (release_id, item_number)
);

create unique index if not exists price_list_one_released_version_idx
  on public.price_list_releases ((status))
  where status = 'RELEASED';

create index if not exists price_list_release_items_item_idx
  on public.price_list_release_items (item_number, release_id);

create index if not exists price_list_releases_previous_idx
  on public.price_list_releases (previous_release_id)
  where previous_release_id is not null;

alter table public.price_list_publish_logs
  add column if not exists release_id uuid references public.price_list_releases(id),
  add column if not exists version_number bigint,
  add column if not exists effective_at timestamptz,
  add column if not exists changed_currencies text[] not null default array[]::text[];

create index if not exists price_list_publish_logs_release_idx
  on public.price_list_publish_logs (release_id)
  where release_id is not null;

alter table public.price_list_releases enable row level security;
alter table public.price_list_release_items enable row level security;

drop policy if exists "Backend can read price list releases" on public.price_list_releases;
create policy "Backend can read price list releases"
on public.price_list_releases for select to authenticated
using (public.is_timan_backend());

drop policy if exists "Backend can read price list release items" on public.price_list_release_items;
create policy "Backend can read price list release items"
on public.price_list_release_items for select to authenticated
using (public.is_timan_backend());

revoke all on public.price_list_releases from public, anon, authenticated;
revoke all on public.price_list_release_items from public, anon, authenticated;
grant select on public.price_list_releases to authenticated;
grant select on public.price_list_release_items to authenticated;

-- Preserve today's current published catalog as the first immutable baseline.
do $$
declare
  baseline_id uuid;
  baseline_count integer;
begin
  if not exists (select 1 from public.price_list_releases)
     and exists (select 1 from public.price_list_published) then
    select count(*) into baseline_count from public.price_list_published;
    insert into public.price_list_releases (
      status, source_file_name, machine_scope, created_at,
      released_at, effective_at, affected_item_count, changed_currencies
    ) values (
      'RELEASED', 'existing-published-catalog', 'all', now(),
      now(), now(), baseline_count, array['DKK', 'EUR', 'SEK']::text[]
    ) returning id into baseline_id;

    insert into public.price_list_release_items (
      release_id, item_number, item_text_da, item_text_de, item_text_en,
      identity_aliases, price_dkk, price_eur, price_sek, is_changed
    )
    select baseline_id, p.item_number, p.item_text_da, p.item_text_de, p.item_text_en,
           coalesce(p.identity_aliases, array[]::text[]),
           p.price_dkk, p.price_eur, p.price_sek, true
    from public.price_list_published p;
  end if;
end;
$$;

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
  perform 1 from public.price_list_items
    where item_number = any(requested_items)
    for update;

  select array_agg(item_number order by item_number), count(*)
  into selected_items, selected_count
  from public.price_list_items
  where item_number = any(requested_items) and is_dirty = true;

  if selected_count <> cardinality(requested_items) then
    raise exception 'Alle valgte varer skal findes og være klargjort før frigivelse.' using errcode = '22023';
  end if;

  select * into previous_release
  from public.price_list_releases
  where status = 'RELEASED'
  order by version_number desc
  limit 1
  for update;

  select * into source_log
  from public.price_list_import_logs
  where import_mode = 'FULL_PRICE_LIST'
    and item_numbers && selected_items
  order by imported_at desc
  limit 1;

  select coalesce(array_agg(currency order by currency), array[]::text[])
  into changed_currencies
  from (
    select 'DKK'::text as currency where exists (
      select 1 from public.price_list_items s
      left join public.price_list_published p using (item_number)
      where s.item_number = any(selected_items) and s.price_dkk is distinct from p.price_dkk
    )
    union all
    select 'EUR'::text where exists (
      select 1 from public.price_list_items s
      left join public.price_list_published p using (item_number)
      where s.item_number = any(selected_items) and s.price_eur is distinct from p.price_eur
    )
    union all
    select 'SEK'::text where exists (
      select 1 from public.price_list_items s
      left join public.price_list_published p using (item_number)
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

  -- Carry forward every unchanged active item, then overlay the selected staged rows.
  insert into public.price_list_release_items (
    release_id, item_number, item_text_da, item_text_de, item_text_en,
    identity_aliases, price_dkk, price_eur, price_sek, is_changed
  )
  select release_row.id, p.item_number, p.item_text_da, p.item_text_de, p.item_text_en,
         coalesce(p.identity_aliases, array[]::text[]),
         p.price_dkk, p.price_eur, p.price_sek, false
  from public.price_list_published p
  where not (p.item_number = any(selected_items));

  insert into public.price_list_release_items (
    release_id, item_number, item_text_da, item_text_de, item_text_en,
    identity_aliases, price_dkk, price_eur, price_sek, is_changed
  )
  select release_row.id, s.item_number, s.item_text_da,
         coalesce(s.item_text_de, p.item_text_de), coalesce(s.item_text_en, p.item_text_en),
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
    item_number, item_text_da, item_text_de, item_text_en,
    price_dkk, price_eur, price_sek,
    published_by, published_by_email, published_at
  )
  select s.item_number, s.item_text_da, s.item_text_de, s.item_text_en,
         s.price_dkk, s.price_eur, s.price_sek,
         auth.uid(), current_email, release_time
  from public.price_list_items s
  where s.item_number = any(selected_items)
  on conflict (item_number) do update
  set item_text_da = coalesce(excluded.item_text_da, public.price_list_published.item_text_da),
      item_text_de = coalesce(excluded.item_text_de, public.price_list_published.item_text_de),
      item_text_en = coalesce(excluded.item_text_en, public.price_list_published.item_text_en),
      price_dkk = coalesce(excluded.price_dkk, public.price_list_published.price_dkk),
      price_eur = coalesce(excluded.price_eur, public.price_list_published.price_eur),
      price_sek = coalesce(excluded.price_sek, public.price_list_published.price_sek),
      published_by = excluded.published_by,
      published_by_email = excluded.published_by_email,
      published_at = excluded.published_at;

  update public.price_list_items
  set is_dirty = false, last_published_at = release_time
  where item_number = any(selected_items);

  if previous_release.id is not null then
    update public.price_list_releases
    set status = 'SUPERSEDED', superseded_at = release_time
    where id = previous_release.id;
  end if;

  update public.price_list_releases
  set status = 'RELEASED', released_by = auth.uid(), released_by_email = current_email,
      released_at = release_time, effective_at = release_time
  where id = release_row.id
  returning * into release_row;

  insert into public.price_list_publish_logs (
    published_by, published_by_email, published_at,
    created_count, updated_count, skipped_count, error_count,
    item_numbers, errors, release_id, version_number, effective_at, changed_currencies
  ) values (
    auth.uid(), current_email, release_time,
    created_count, updated_count, 0, 0,
    selected_items, '[]'::jsonb, release_row.id, release_row.version_number,
    release_time, changed_currencies
  );

  return jsonb_build_object(
    'created', created_count,
    'updated', updated_count,
    'skipped', 0,
    'errors', '[]'::jsonb,
    'release_id', release_row.id,
    'version_number', release_row.version_number,
    'effective_at', release_time,
    'affected_item_count', selected_count,
    'changed_currencies', changed_currencies
  );
end;
$$;

revoke all on function public.release_price_list_items(jsonb) from public, anon;
grant execute on function public.release_price_list_items(jsonb) to authenticated;

comment on table public.price_list_releases is
  'Immutable price-list release audit. Only the RELEASED version feeds price_list_published.';
comment on table public.price_list_release_items is
  'Complete selling-price snapshot for a price-list release; cost prices are deliberately excluded.';
