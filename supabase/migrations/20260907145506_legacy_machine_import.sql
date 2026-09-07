-- Controlled manual import for historic machines.
--
-- Imported machines deliberately reuse warranty_registrations, which is the
-- existing machine register behind Service & Teknik -> Søg maskine. Source
-- dealer data remains immutable while dealer_account_id always represents the
-- current active, scoped dealer.

create table if not exists public.machine_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  imported_by_user_id uuid,
  imported_by_email text,
  total_rows integer not null default 0 check (total_rows >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  matched_count integer not null default 0 check (matched_count >= 0),
  unresolved_count integer not null default 0 check (unresolved_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.legacy_machine_dealer_mappings (
  id uuid primary key default gen_random_uuid(),
  source_dealer_number text not null,
  source_dealer_name text,
  historical_dealer_account_id uuid references public.dealer_accounts(id) on delete set null,
  active_dealer_account_id uuid not null references public.dealer_accounts(id) on delete restrict,
  active_dealer_account_number text not null,
  mapped_by_user_id uuid,
  mapped_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legacy_machine_dealer_mappings_source_not_empty check (length(trim(source_dealer_number)) > 0),
  constraint legacy_machine_dealer_mappings_source_unique unique (source_dealer_number)
);

alter table public.warranty_registrations
  add column if not exists import_batch_id uuid references public.machine_import_batches(id) on delete set null,
  add column if not exists source_dealer_number text,
  add column if not exists source_dealer_name text,
  add column if not exists legacy_warranty_reference text,
  add column if not exists legacy_operating_hours numeric,
  add column if not exists legacy_last_activity_at timestamptz,
  add column if not exists legacy_history_text text;

create index if not exists warranty_registrations_import_batch_idx
  on public.warranty_registrations(import_batch_id)
  where import_batch_id is not null;

create index if not exists warranty_registrations_source_dealer_idx
  on public.warranty_registrations(source_dealer_number)
  where source_dealer_number is not null;

create index if not exists legacy_machine_dealer_mappings_target_idx
  on public.legacy_machine_dealer_mappings(active_dealer_account_id);

create or replace function public.set_updated_at_legacy_machine_dealer_mappings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_legacy_machine_dealer_mappings_updated_at on public.legacy_machine_dealer_mappings;
create trigger trg_legacy_machine_dealer_mappings_updated_at
before update on public.legacy_machine_dealer_mappings
for each row execute function public.set_updated_at_legacy_machine_dealer_mappings();

alter table public.machine_import_batches enable row level security;
alter table public.legacy_machine_dealer_mappings enable row level security;

drop policy if exists machine_import_batches_internal_select on public.machine_import_batches;
create policy machine_import_batches_internal_select
  on public.machine_import_batches for select to authenticated
  using (public.is_timan_global_warranty());

drop policy if exists legacy_machine_dealer_mappings_internal_select on public.legacy_machine_dealer_mappings;
create policy legacy_machine_dealer_mappings_internal_select
  on public.legacy_machine_dealer_mappings for select to authenticated
  using (public.is_timan_global_warranty());

grant select on public.machine_import_batches, public.legacy_machine_dealer_mappings to authenticated;
grant all on public.machine_import_batches, public.legacy_machine_dealer_mappings to service_role;

create or replace function public.import_legacy_machines(
  p_file_name text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_row jsonb;
  v_serial_raw text;
  v_serial_key text;
  v_dealer_number text;
  v_dealer_name text;
  v_target public.dealer_accounts%rowtype;
  v_existing boolean;
  v_created integer := 0;
  v_matched integer := 0;
  v_unresolved integer := 0;
  v_duplicates integer := 0;
  v_errors integer := 0;
  v_total integer := 0;
  v_delivery_date date;
  v_activity_at timestamptz;
  v_hours numeric;
begin
  if not public.is_timan_global_warranty() then
    raise exception 'Not authorized to import machines';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Import requires at least one row';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Import may contain at most 5000 rows';
  end if;

  insert into public.machine_import_batches (file_name, imported_by_user_id, imported_by_email, total_rows)
  select
    coalesce(nullif(trim(p_file_name), ''), 'machine-import.xlsx'),
    au.id,
    au.email,
    jsonb_array_length(p_rows)
  from public.app_users au
  where au.auth_user_id = auth.uid()
     or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  limit 1
  returning id into v_batch_id;

  if v_batch_id is null then
    raise exception 'No canonical portal user found for importer';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_total := v_total + 1;
    v_serial_raw := nullif(trim(coalesce(v_row ->> 'serial', '')), '');
    v_serial_key := upper(regexp_replace(coalesce(v_serial_raw, ''), '[^A-Za-z0-9]+', '', 'g'));
    v_dealer_number := nullif(trim(coalesce(v_row ->> 'dealerNumber', '')), '');
    v_dealer_name := nullif(trim(coalesce(v_row ->> 'dealerName', '')), '');

    if v_serial_raw is null or v_serial_key = '' then
      v_errors := v_errors + 1;
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(v_serial_key, 0));
    select exists (
      select 1 from public.warranty_registrations wr
      where upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) = v_serial_key
    ) into v_existing;
    if v_existing then
      v_duplicates := v_duplicates + 1;
      continue;
    end if;

    v_target := null;
    if v_dealer_number is not null then
      select da.* into v_target
      from public.dealer_accounts da
      where da.account_number = v_dealer_number
        and coalesce(da.is_active, true)
        and coalesce(da.status, 'active') = 'active'
        and not coalesce(da.is_deleted, false)
        and not coalesce(da.is_blocked, false)
      limit 1;

      if v_target.id is null then
        select da.* into v_target
        from public.legacy_machine_dealer_mappings map
        join public.dealer_accounts da on da.id = map.active_dealer_account_id
        where map.source_dealer_number = v_dealer_number
          and coalesce(da.is_active, true)
          and coalesce(da.status, 'active') = 'active'
          and not coalesce(da.is_deleted, false)
          and not coalesce(da.is_blocked, false)
        limit 1;
      end if;
    end if;

    begin
      v_delivery_date := nullif(trim(coalesce(v_row ->> 'deliveryDate', '')), '')::date;
    exception when others then
      v_delivery_date := null;
    end;
    begin
      v_activity_at := nullif(trim(coalesce(v_row ->> 'latestActivityAt', '')), '')::timestamptz;
    exception when others then
      v_activity_at := null;
    end;
    begin
      v_hours := nullif(trim(coalesce(v_row ->> 'hours', '')), '')::numeric;
    exception when others then
      v_hours := null;
    end;

    insert into public.warranty_registrations (
      sharepoint_item_id, source, machine_serial_number, machine_serial_raw,
      machine_model, dealer_name_snapshot, dealer_account_id, dealer_account_number,
      dealer_match_status, dealer_match_confidence, dealer_match_method,
      delivery_date, registration_date, is_active_in_source, import_batch_id,
      source_dealer_number, source_dealer_name, legacy_warranty_reference,
      legacy_operating_hours, legacy_last_activity_at, legacy_history_text, comment
    ) values (
      'legacy-import:' || v_batch_id::text || ':' || v_serial_key,
      'legacy_machine_import', v_serial_raw, v_serial_raw,
      nullif(trim(coalesce(v_row ->> 'model', '')), ''), coalesce(v_dealer_name, 'Ukendt forhandler'),
      v_target.id, case when v_target.id is null then null else v_target.account_number end,
      case when v_target.id is null then 'needs_review' else 'matched' end,
      case when v_target.id is null then null else 1.0 end,
      case when v_target.id is null then null when v_target.account_number = v_dealer_number then 'active_account_number' else 'legacy_mapping' end,
      v_delivery_date, v_activity_at, true, v_batch_id,
      v_dealer_number, v_dealer_name, nullif(trim(coalesce(v_row ->> 'warrantyNumber', '')), ''),
      v_hours, v_activity_at, nullif(trim(coalesce(v_row ->> 'history', '')), ''),
      nullif(trim(coalesce(v_row ->> 'history', '')), '')
    );

    v_created := v_created + 1;
    if v_target.id is null then v_unresolved := v_unresolved + 1; else v_matched := v_matched + 1; end if;
  end loop;

  update public.machine_import_batches
  set created_count = v_created, matched_count = v_matched, unresolved_count = v_unresolved,
      duplicate_count = v_duplicates, error_count = v_errors
  where id = v_batch_id;

  return jsonb_build_object('batchId', v_batch_id, 'total', v_total, 'created', v_created,
    'matched', v_matched, 'unresolved', v_unresolved, 'duplicates', v_duplicates, 'errors', v_errors);
end;
$$;

create or replace function public.resolve_legacy_machine_dealer(
  p_source_dealer_number text,
  p_source_dealer_name text,
  p_active_dealer_account_id uuid,
  p_create_historical boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_number text := nullif(trim(p_source_dealer_number), '');
  v_target public.dealer_accounts%rowtype;
  v_historical_id uuid;
  v_updated integer := 0;
  v_actor public.app_users%rowtype;
begin
  if not public.is_timan_global_warranty() then
    raise exception 'Not authorized to resolve machine dealers';
  end if;
  if v_source_number is null then raise exception 'Source dealer number is required'; end if;

  select * into v_target from public.dealer_accounts da
  where da.id = p_active_dealer_account_id
    and coalesce(da.is_active, true)
    and coalesce(da.status, 'active') = 'active'
    and not coalesce(da.is_deleted, false)
    and not coalesce(da.is_blocked, false);
  if v_target.id is null then raise exception 'Selected target must be an active dealer'; end if;

  select * into v_actor from public.app_users au
  where au.auth_user_id = auth.uid()
     or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  limit 1;

  if p_create_historical then
    select id into v_historical_id from public.dealer_accounts where account_number = v_source_number limit 1;
    if v_historical_id is null then
      insert into public.dealer_accounts (
        account_number, dealer_number, company_name, display_name, status, is_active,
        source, successor_dealer_id, successor_dealer_account_number, closed_reason, closed_at
      ) values (
        v_source_number, v_source_number, coalesce(nullif(trim(p_source_dealer_name), ''), 'Historisk forhandler ' || v_source_number),
        nullif(trim(p_source_dealer_name), ''), 'closed', false,
        'legacy_machine_import', v_target.id, v_target.account_number, 'historisk maskinimport', now()
      ) returning id into v_historical_id;
    end if;
  end if;

  insert into public.legacy_machine_dealer_mappings (
    source_dealer_number, source_dealer_name, historical_dealer_account_id,
    active_dealer_account_id, active_dealer_account_number, mapped_by_user_id, mapped_by_email
  ) values (
    v_source_number, nullif(trim(p_source_dealer_name), ''), v_historical_id,
    v_target.id, v_target.account_number, v_actor.id, v_actor.email
  ) on conflict (source_dealer_number) do update set
    source_dealer_name = excluded.source_dealer_name,
    historical_dealer_account_id = coalesce(excluded.historical_dealer_account_id, legacy_machine_dealer_mappings.historical_dealer_account_id),
    active_dealer_account_id = excluded.active_dealer_account_id,
    active_dealer_account_number = excluded.active_dealer_account_number,
    mapped_by_user_id = excluded.mapped_by_user_id,
    mapped_by_email = excluded.mapped_by_email;

  update public.warranty_registrations
  set dealer_account_id = v_target.id,
      dealer_account_number = v_target.account_number,
      dealer_match_status = 'matched',
      dealer_match_confidence = 1.0,
      dealer_match_method = 'legacy_mapping',
      dealer_match_reviewed_by = v_actor.id,
      dealer_match_reviewed_at = now()
  where source = 'legacy_machine_import'
    and source_dealer_number = v_source_number
    and (dealer_account_id is null or dealer_account_id is distinct from v_target.id);
  get diagnostics v_updated = row_count;

  return jsonb_build_object('updated', v_updated, 'activeDealerNumber', v_target.account_number, 'historicalDealerId', v_historical_id);
end;
$$;

revoke all on function public.import_legacy_machines(text, jsonb) from public;
revoke all on function public.resolve_legacy_machine_dealer(text, text, uuid, boolean) from public;
grant execute on function public.import_legacy_machines(text, jsonb) to authenticated;
grant execute on function public.resolve_legacy_machine_dealer(text, text, uuid, boolean) to authenticated;

create or replace view public.v_machine_latest_warranty
with (security_invoker = true)
as
  select distinct on (wr.machine_serial_number) wr.*
  from public.warranty_registrations wr
  where wr.is_active_in_source = true
  order by wr.machine_serial_number, wr.delivery_date desc nulls last, wr.registration_date desc nulls last;
