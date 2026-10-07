-- Canonical append-only price-change events, linked to the existing immutable
-- price-list release lifecycle. Staged edits remain covered by
-- price_list_item_history; this table records only effective selling-price
-- changes at release time.

create table if not exists public.price_list_price_changes (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.price_list_releases(id),
  release_version_number bigint not null,
  import_log_id uuid references public.price_list_import_logs(id) on delete set null,
  item_number text not null,
  product_name text,
  product_group text,
  old_price_dkk numeric,
  new_price_dkk numeric,
  change_dkk numeric,
  change_pct numeric,
  old_price_sek numeric,
  new_price_sek numeric,
  old_price_eur numeric,
  new_price_eur numeric,
  change_source text not null check (change_source in (
    'MANUAL_UPLOAD', 'MASS_CHANGE', 'DIRECT_PRICE', 'PERCENT_CHANGE', 'OTHER'
  )),
  source_file_name text,
  changed_by_app_user_id uuid not null references public.app_users(id),
  changed_by_name text,
  changed_by_email text,
  changed_at timestamptz not null,
  effective_at timestamptz not null,
  reason_note text,
  unique (release_id, item_number),
  check (old_price_dkk is distinct from new_price_dkk
    or old_price_sek is distinct from new_price_sek
    or old_price_eur is distinct from new_price_eur)
);

create index if not exists price_list_price_changes_item_date_idx
  on public.price_list_price_changes (item_number, changed_at desc);
create index if not exists price_list_price_changes_group_date_idx
  on public.price_list_price_changes (product_group, changed_at desc);
create index if not exists price_list_price_changes_direction_date_idx
  on public.price_list_price_changes (change_dkk, changed_at desc);
create index if not exists price_list_price_changes_actor_date_idx
  on public.price_list_price_changes (changed_by_app_user_id, changed_at desc);
create index if not exists price_list_price_changes_version_idx
  on public.price_list_price_changes (release_version_number, item_number);

alter table public.price_list_price_changes enable row level security;

drop policy if exists "Backend can read canonical price changes" on public.price_list_price_changes;
create policy "Backend can read canonical price changes"
on public.price_list_price_changes
for select
to authenticated
using ((select public.is_timan_backend()));

revoke all on table public.price_list_price_changes from public, anon, authenticated;
grant select on table public.price_list_price_changes to authenticated;

create or replace function public.release_price_list_items(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_items text[];
  selected_items text[];
  item_groups jsonb := coalesce(payload -> 'item_groups', '{}'::jsonb);
  item_sources jsonb := coalesce(payload -> 'item_sources', '{}'::jsonb);
  previous_release public.price_list_releases%rowtype;
  release_row public.price_list_releases%rowtype;
  source_log public.price_list_import_logs%rowtype;
  actor_app_user public.app_users%rowtype;
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

  select au.* into actor_app_user
  from public.app_users au
  where au.auth_user_id = auth.uid()
  limit 1;
  if actor_app_user.id is null then
    raise exception 'Canonical app_user kunne ikke findes for den aktuelle bruger.' using errcode = '42501';
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
    and imported_at >= (
      select min(updated_at) from public.price_list_items where item_number = any(selected_items)
    )
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

  insert into public.price_list_price_changes (
    release_id, release_version_number, import_log_id,
    item_number, product_name, product_group,
    old_price_dkk, new_price_dkk, change_dkk, change_pct,
    old_price_sek, new_price_sek, old_price_eur, new_price_eur,
    change_source, source_file_name,
    changed_by_app_user_id, changed_by_name, changed_by_email,
    changed_at, effective_at
  )
  select
    release_row.id,
    release_row.version_number,
    source_log.id,
    s.item_number,
    coalesce(s.item_text_da, p.item_text_da),
    coalesce(nullif(item_groups ->> s.item_number, ''), nullif(source_log.machine_scope, 'all')),
    p.price_dkk,
    coalesce(s.price_dkk, p.price_dkk),
    case when p.price_dkk is null or coalesce(s.price_dkk, p.price_dkk) is null
      then null else coalesce(s.price_dkk, p.price_dkk) - p.price_dkk end,
    case when p.price_dkk is null or p.price_dkk = 0 or coalesce(s.price_dkk, p.price_dkk) is null
      then null else ((coalesce(s.price_dkk, p.price_dkk) - p.price_dkk) / p.price_dkk) * 100 end,
    p.price_sek,
    coalesce(s.price_sek, p.price_sek),
    p.price_eur,
    coalesce(s.price_eur, p.price_eur),
    case
      when item_sources ->> s.item_number in ('MANUAL_UPLOAD', 'MASS_CHANGE', 'DIRECT_PRICE', 'PERCENT_CHANGE')
        then item_sources ->> s.item_number
      when source_log.id is null then 'DIRECT_PRICE'
      else 'MANUAL_UPLOAD'
    end,
    source_log.file_name,
    actor_app_user.id,
    coalesce(nullif(actor_app_user.display_name, ''), nullif(actor_app_user.full_name, ''), actor_app_user.email),
    actor_app_user.email,
    release_time,
    release_time
  from public.price_list_items s
  left join public.price_list_published p using (item_number)
  where s.item_number = any(selected_items)
    and (
      coalesce(s.price_dkk, p.price_dkk) is distinct from p.price_dkk
      or coalesce(s.price_sek, p.price_sek) is distinct from p.price_sek
      or coalesce(s.price_eur, p.price_eur) is distinct from p.price_eur
    )
  on conflict (release_id, item_number) do nothing;

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
