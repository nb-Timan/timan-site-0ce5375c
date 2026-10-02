-- Preserve the immutable Original Budget provenance on every materialized
-- Working Budget unit. Current month/dealer fields may change; these source
-- fields never do.

alter table public.crm_working_budget_units
  add column if not exists original_month_idx integer,
  add column if not exists original_dealer_account_id uuid references public.dealer_accounts(id) on delete restrict,
  add column if not exists original_dealer_account_number text,
  add column if not exists original_dealer_name text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'crm_working_budget_units_original_month_idx_check'
      and conrelid = 'public.crm_working_budget_units'::regclass
  ) then
    alter table public.crm_working_budget_units
      add constraint crm_working_budget_units_original_month_idx_check
      check (original_month_idx is null or original_month_idx between 0 and 11);
  end if;
end;
$$;

create index if not exists crm_working_budget_units_original_source_idx
  on public.crm_working_budget_units (
    budget_line_id, original_month_idx, original_dealer_account_id
  );

-- Existing canonical source rows already identify their immutable source.
update public.crm_working_budget_units unit
set original_month_idx = dealer.month_idx,
    original_dealer_account_id = dealer.dealer_account_id,
    original_dealer_account_number = dealer.dealer_account_number,
    original_dealer_name = dealer.dealer_name
from public.crm_budget_dealer_lines dealer
where unit.origin_type = 'original_budget'
  and unit.origin_id = dealer.id
  and (
    unit.original_month_idx is distinct from dealer.month_idx
    or unit.original_dealer_account_id is distinct from dealer.dealer_account_id
    or unit.original_dealer_account_number is distinct from dealer.dealer_account_number
    or unit.original_dealer_name is distinct from dealer.dealer_name
  );

update public.crm_working_budget_units unit
set original_month_idx = coalesce(reference.month_idx, unit.month_idx),
    original_dealer_account_id = unit.dealer_account_id,
    original_dealer_account_number = unit.dealer_account_number,
    original_dealer_name = unit.dealer_name
from public.budget_references reference
where unit.origin_type = 'working_reference'
  and unit.origin_id = reference.id
  and unit.original_month_idx is null;

-- Keep the deterministic repair set for this transaction. A generated
-- materialization ordinal is matched only to the same canonical ordinal in
-- the immutable Original Budget allocation. Existing source slots and cells
-- backed by a Working Budget reference for that source month are excluded.
create temporary table working_budget_unit_provenance_repairs (
  unit_id uuid primary key,
  origin_id uuid not null,
  source_month_idx integer not null,
  unit_ordinal integer not null,
  dealer_account_id uuid,
  dealer_account_number text,
  dealer_name text
) on commit drop;

insert into working_budget_unit_provenance_repairs (
  unit_id, origin_id, source_month_idx, unit_ordinal,
  dealer_account_id, dealer_account_number, dealer_name
)
with candidate_units as (
  select
    unit.id,
    unit.budget_line_id,
    split_part(unit.materialization_key, ':', 2)::integer as source_month_idx,
    split_part(unit.materialization_key, ':', 3)::integer as source_ordinal
  from public.crm_working_budget_units unit
  where unit.origin_type = 'manual_add'
    and unit.materialization_key ~ '^materialized-unallocated:[0-9]+:[0-9]+$'
    and unit.dealer_account_id is null
    and unit.dealer_account_number is null
    and unit.dealer_name is null
),
original_slots as (
  select
    line.id as budget_line_id,
    dealer.month_idx as source_month_idx,
    dealer.id as origin_id,
    dealer.dealer_account_id,
    dealer.dealer_account_number,
    dealer.dealer_name,
    slot.unit_ordinal,
    row_number() over (
      partition by line.id, dealer.month_idx
      order by dealer.dealer_account_number nulls last,
               dealer.dealer_name nulls last,
               dealer.id,
               slot.unit_ordinal
    ) as source_ordinal
  from public.crm_budget_lines line
  join public.crm_budget_dealer_lines dealer
    on dealer.year = line.year
   and lower(dealer.seller_email) = lower(line.seller_email)
   and lower(dealer.product_key) = lower(line.product_key)
   and not dealer.excluded_from_total
   and dealer.qty > 0
  cross join lateral generate_series(1, dealer.qty::integer) slot(unit_ordinal)
),
represented_slots as (
  select
    unit.budget_line_id,
    dealer.month_idx as source_month_idx,
    unit.origin_id,
    split_part(unit.materialization_key, ':', 3)::integer as unit_ordinal
  from public.crm_working_budget_units unit
  join public.crm_budget_dealer_lines dealer on dealer.id = unit.origin_id
  where unit.origin_type = 'original_budget'
    and unit.materialization_key ~ '^original:[0-9a-f-]+:[0-9]+$'
),
remaining_slots as (
  select slot.*
  from original_slots slot
  left join represented_slots represented
    on represented.budget_line_id = slot.budget_line_id
   and represented.source_month_idx = slot.source_month_idx
   and represented.origin_id = slot.origin_id
   and represented.unit_ordinal = slot.unit_ordinal
  where represented.origin_id is null
),
group_counts as (
  select
    candidate.budget_line_id,
    candidate.source_month_idx,
    count(*) as candidate_count,
    (
      select count(*)
      from remaining_slots slot
      where slot.budget_line_id = candidate.budget_line_id
        and slot.source_month_idx = candidate.source_month_idx
    ) as remaining_slot_count,
    exists (
      select 1
      from public.crm_working_budget_units related
      join public.budget_references reference on reference.id = related.origin_id
      where related.budget_line_id = candidate.budget_line_id
        and related.origin_type = 'working_reference'
        and reference.month_idx = candidate.source_month_idx
    ) as has_same_source_working_reference
  from candidate_units candidate
  group by candidate.budget_line_id, candidate.source_month_idx
),
safe_groups as (
  select grouped.*
  from group_counts grouped
  where grouped.remaining_slot_count > 0
    and grouped.candidate_count >= grouped.remaining_slot_count
    and not grouped.has_same_source_working_reference
)
select
  candidate.id,
  slot.origin_id,
  slot.source_month_idx,
  slot.unit_ordinal,
  slot.dealer_account_id,
  slot.dealer_account_number,
  slot.dealer_name
from candidate_units candidate
join safe_groups safe
  on safe.budget_line_id = candidate.budget_line_id
 and safe.source_month_idx = candidate.source_month_idx
join remaining_slots slot
  on slot.budget_line_id = candidate.budget_line_id
 and slot.source_month_idx = candidate.source_month_idx
 and slot.source_ordinal = candidate.source_ordinal;

update public.crm_working_budget_units unit
set dealer_account_id = repair.dealer_account_id,
    dealer_account_number = repair.dealer_account_number,
    dealer_name = repair.dealer_name,
    origin_type = 'original_budget',
    origin_id = repair.origin_id,
    materialization_key = 'original:' || repair.origin_id::text || ':' || repair.unit_ordinal::text,
    original_month_idx = repair.source_month_idx,
    original_dealer_account_id = repair.dealer_account_id,
    original_dealer_account_number = repair.dealer_account_number,
    original_dealer_name = repair.dealer_name,
    updated_at = now()
from working_budget_unit_provenance_repairs repair
where unit.id = repair.unit_id;

-- Preserve source month for genuinely unallocated and legacy manually added
-- units without assigning a dealer that cannot be proven.
update public.crm_working_budget_units unit
set original_month_idx = case
      when unit.materialization_key ~ '^materialized-unallocated:[0-9]+:[0-9]+$'
        then split_part(unit.materialization_key, ':', 2)::integer
      when unit.materialization_key like 'added:%' then coalesce((
        select (audit.new_value ->> 'month_idx')::integer
        from public.audit_log audit
        where audit.record_type = 'crm_working_budget_adjustment'
          and audit.record_id = split_part(unit.materialization_key, ':', 2)
        limit 1
      ), unit.month_idx)
      else unit.month_idx
    end,
    original_dealer_account_id = coalesce(unit.original_dealer_account_id, unit.dealer_account_id),
    original_dealer_account_number = coalesce(unit.original_dealer_account_number, unit.dealer_account_number),
    original_dealer_name = coalesce(unit.original_dealer_name, unit.dealer_name)
where unit.original_month_idx is null;

-- New materialization no longer treats the mere existence of an old audit as
-- a reason to discard immutable dealer allocations. A quantity below the
-- original total remains unallocated because the removed dealer is ambiguous;
-- all later edits use exact unit identities and therefore retain provenance.
create or replace function public.materialize_crm_working_budget_units(
  p_budget_line_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.crm_budget_lines%rowtype;
  v_forecast public.crm_budget_forecasts%rowtype;
  v_month_idx integer;
  v_total integer;
  v_remaining integer;
  v_sequence integer := 0;
  v_cell_key text;
  v_product_code text;
  v_original_total integer;
  v_source record;
  v_unit_idx integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_budget_line_id::text, 0)
  );

  select * into v_line
  from public.crm_budget_lines line
  where line.id = p_budget_line_id;
  if not found then raise exception 'Working Budget line not found'; end if;

  select * into v_forecast
  from public.crm_budget_forecasts forecast
  where forecast.budget_line_id = p_budget_line_id;
  if not found or v_forecast.monthly_qty is null
     or array_length(v_forecast.monthly_qty, 1) <> 12 then
    raise exception 'Working Budget monthly forecast is not initialized';
  end if;

  if exists (
    select 1 from public.crm_working_budget_units unit
    where unit.budget_line_id = p_budget_line_id
  ) then
    return (
      select count(*)::integer
      from public.crm_working_budget_units unit
      where unit.budget_line_id = p_budget_line_id and unit.status = 'active'
    );
  end if;

  v_product_code := upper(coalesce(
    nullif(v_line.item_number, ''), nullif(v_line.product_key, ''),
    v_line.product_name, '—'
  ));

  for v_month_idx in 0..11 loop
    v_total := greatest(0, coalesce(v_forecast.monthly_qty[v_month_idx + 1], 0));
    v_remaining := v_total;
    if v_total = 0 then continue; end if;

    v_cell_key := v_line.year::text || '|'
      || upper(coalesce(nullif(v_line.seller_initials, ''), '—')) || '|'
      || v_product_code || '|' || lpad(v_month_idx::text, 2, '0')
      || '|arbejdsbudget';

    if exists (
      select 1 from public.budget_references reference
      where reference.cell_key = v_cell_key
        and reference.budget_year = v_line.year
        and reference.budget_type = 'arbejdsbudget'
        and coalesce(reference.delta_qty, 0) > 0
    ) then
      for v_source in
        select reference.id, reference.dealer_account_id,
               reference.dealer_account_number, reference.dealer_name,
               greatest(0, coalesce(reference.delta_qty, 0))::integer as qty
        from public.budget_references reference
        where reference.cell_key = v_cell_key
          and reference.budget_year = v_line.year
          and reference.budget_type = 'arbejdsbudget'
          and coalesce(reference.delta_qty, 0) > 0
        order by reference.created_at, reference.id
      loop
        for v_unit_idx in 1..least(v_source.qty, v_remaining) loop
          v_sequence := v_sequence + 1;
          insert into public.crm_working_budget_units (
            budget_line_id, sequence_no, month_idx,
            dealer_account_id, dealer_account_number, dealer_name,
            origin_type, origin_id, materialization_key, created_by,
            original_month_idx, original_dealer_account_id,
            original_dealer_account_number, original_dealer_name
          ) values (
            p_budget_line_id, v_sequence, v_month_idx,
            v_source.dealer_account_id, v_source.dealer_account_number,
            split_part(coalesce(v_source.dealer_name, 'Ukendt forhandler'), '·', 1),
            'working_reference', v_source.id,
            'reference:' || v_source.id::text || ':' || v_unit_idx::text,
            (select auth.uid()), v_month_idx, v_source.dealer_account_id,
            v_source.dealer_account_number,
            split_part(coalesce(v_source.dealer_name, 'Ukendt forhandler'), '·', 1)
          );
          v_remaining := v_remaining - 1;
          exit when v_remaining = 0;
        end loop;
        exit when v_remaining = 0;
      end loop;
    else
      select coalesce(sum(dealer.qty), 0)::integer
      into v_original_total
      from public.crm_budget_dealer_lines dealer
      where dealer.year = v_line.year
        and dealer.month_idx = v_month_idx
        and lower(dealer.seller_email) = lower(v_line.seller_email)
        and lower(dealer.product_key) = lower(v_line.product_key)
        and not dealer.excluded_from_total
        and dealer.qty > 0;

      if v_original_total > 0 and v_total >= v_original_total then
        for v_source in
          select dealer.id, dealer.dealer_account_id,
                 dealer.dealer_account_number, dealer.dealer_name,
                 dealer.qty::integer as qty
          from public.crm_budget_dealer_lines dealer
          where dealer.year = v_line.year
            and dealer.month_idx = v_month_idx
            and lower(dealer.seller_email) = lower(v_line.seller_email)
            and lower(dealer.product_key) = lower(v_line.product_key)
            and not dealer.excluded_from_total
            and dealer.qty > 0
          order by dealer.dealer_account_number nulls last,
                   dealer.dealer_name nulls last, dealer.id
        loop
          for v_unit_idx in 1..least(v_source.qty, v_remaining) loop
            v_sequence := v_sequence + 1;
            insert into public.crm_working_budget_units (
              budget_line_id, sequence_no, month_idx,
              dealer_account_id, dealer_account_number, dealer_name,
              origin_type, origin_id, materialization_key, created_by,
              original_month_idx, original_dealer_account_id,
              original_dealer_account_number, original_dealer_name
            ) values (
              p_budget_line_id, v_sequence, v_month_idx,
              v_source.dealer_account_id, v_source.dealer_account_number,
              coalesce(v_source.dealer_name, v_source.dealer_account_number, 'Ukendt forhandler'),
              'original_budget', v_source.id,
              'original:' || v_source.id::text || ':' || v_unit_idx::text,
              (select auth.uid()), v_month_idx, v_source.dealer_account_id,
              v_source.dealer_account_number,
              coalesce(v_source.dealer_name, v_source.dealer_account_number, 'Ukendt forhandler')
            );
            v_remaining := v_remaining - 1;
            exit when v_remaining = 0;
          end loop;
          exit when v_remaining = 0;
        end loop;
      end if;
    end if;

    for v_unit_idx in 1..v_remaining loop
      v_sequence := v_sequence + 1;
      insert into public.crm_working_budget_units (
        budget_line_id, sequence_no, month_idx, origin_type, origin_id,
        materialization_key, created_by, original_month_idx
      ) values (
        p_budget_line_id, v_sequence, v_month_idx, 'manual_add', null,
        'materialized-unallocated:' || v_month_idx::text || ':' || v_unit_idx::text,
        (select auth.uid()), v_month_idx
      );
    end loop;
  end loop;

  return v_sequence;
end;
$$;

-- Freeze a unit-derived dealer distribution into the existing reference model
-- before an exact unit is moved or removed. This makes repaired provenance
-- operational without introducing another allocation registry.
create or replace function public.ensure_crm_working_budget_unit_references(
  p_budget_line_id uuid,
  p_month_idx integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.crm_budget_lines%rowtype;
  v_forecast public.crm_budget_forecasts%rowtype;
  v_cell_key text;
  v_month text;
  v_total integer;
  v_inserted integer := 0;
begin
  if p_month_idx not between 0 and 11 then
    raise exception 'Month must be a value from 0 to 11';
  end if;

  select * into v_line from public.crm_budget_lines line
  where line.id = p_budget_line_id;
  if not found then raise exception 'Working Budget line not found'; end if;

  select * into v_forecast from public.crm_budget_forecasts forecast
  where forecast.budget_line_id = p_budget_line_id;
  if not found then raise exception 'Working Budget monthly forecast is not initialized'; end if;

  v_total := greatest(0, coalesce(v_forecast.monthly_qty[p_month_idx + 1], 0));
  v_month := (array['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'])[p_month_idx + 1];
  v_cell_key := v_line.year::text || '|'
    || upper(coalesce(nullif(v_line.seller_initials, ''), '—')) || '|'
    || upper(coalesce(nullif(v_line.item_number, ''), nullif(v_line.product_key, ''), v_line.product_name, '—'))
    || '|' || lpad(p_month_idx::text, 2, '0') || '|arbejdsbudget';

  if exists (
    select 1 from public.budget_references reference
    where reference.cell_key = v_cell_key
      and reference.budget_year = v_line.year
      and reference.budget_type = 'arbejdsbudget'
      and coalesce(reference.delta_qty, 0) > 0
  ) then
    return 0;
  end if;

  insert into public.budget_references (
    cell_key, budget_year, seller_initials, seller_email, product_code,
    model_name, category, month, month_idx, budget_type, old_value, new_value,
    dealer_name, dealer_account_id, dealer_account_number, delta_qty,
    note, created_by_email, created_by_name, reference_group_id
  )
  select
    v_cell_key, v_line.year, v_line.seller_initials, v_line.seller_email,
    coalesce(v_line.item_number, v_line.product_key), v_line.product_name,
    v_line.category, v_month, p_month_idx, 'arbejdsbudget', v_total, v_total,
    coalesce(max(unit.dealer_name), max(unit.dealer_account_number), 'Ukendt forhandler'),
    unit.dealer_account_id, max(unit.dealer_account_number), count(*)::integer,
    'Arvet fra Working Budget-enhedens oprindelige fordeling',
    coalesce((select auth.email()), v_line.seller_email), 'System',
    'unit-provenance:' || p_budget_line_id::text || ':' || p_month_idx::text
  from public.crm_working_budget_units unit
  where unit.budget_line_id = p_budget_line_id
    and unit.month_idx = p_month_idx
    and unit.status = 'active'
    and (
      unit.dealer_account_id is not null
      or unit.dealer_account_number is not null
      or unit.dealer_name is not null
    )
  group by unit.dealer_account_id,
           coalesce(unit.dealer_account_number, lower(unit.dealer_name));

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.ensure_crm_working_budget_unit_references(uuid, integer)
  from public, anon, authenticated;

-- Make repaired allocations immediately usable by the existing move/remove
-- implementation. The helper is idempotent and writes only missing current
-- Working Budget references.
do $$
declare
  v_cell record;
begin
  for v_cell in
    select distinct unit.budget_line_id, unit.month_idx
    from public.crm_working_budget_units unit
    join working_budget_unit_provenance_repairs repair on repair.unit_id = unit.id
    where unit.status = 'active'
  loop
    perform public.ensure_crm_working_budget_unit_references(
      v_cell.budget_line_id, v_cell.month_idx
    );
  end loop;
end;
$$;

drop function if exists public.list_crm_working_budget_units(uuid);

create function public.list_crm_working_budget_units(
  p_budget_line_id uuid
)
returns table (
  id uuid,
  budget_line_id uuid,
  sequence_no integer,
  month_idx integer,
  dealer_account_id uuid,
  dealer_account_number text,
  dealer_name text,
  origin_type text,
  origin_id uuid,
  original_month_idx integer,
  original_dealer_account_id uuid,
  original_dealer_account_number text,
  original_dealer_name text,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.crm_budget_lines%rowtype;
begin
  select * into v_line from public.crm_budget_lines line
  where line.id = p_budget_line_id;
  if not found then raise exception 'Working Budget line not found'; end if;
  if not (
    public.is_timan_backend()
    or public.is_timan_budget_seller(v_line.seller_email)
  ) then
    raise exception 'Not authorized for this Working Budget scope' using errcode = '42501';
  end if;

  perform public.materialize_crm_working_budget_units(p_budget_line_id);

  return query
  select unit.id, unit.budget_line_id, unit.sequence_no, unit.month_idx,
         unit.dealer_account_id, unit.dealer_account_number, unit.dealer_name,
         unit.origin_type, unit.origin_id, unit.original_month_idx,
         unit.original_dealer_account_id, unit.original_dealer_account_number,
         unit.original_dealer_name, unit.version
  from public.crm_working_budget_units unit
  where unit.budget_line_id = p_budget_line_id and unit.status = 'active'
  order by unit.month_idx, unit.sequence_no;
end;
$$;

create or replace function public.list_crm_working_budget_units_for_year(
  p_year integer
)
returns table (
  id uuid,
  budget_line_id uuid,
  sequence_no integer,
  month_idx integer,
  dealer_account_id uuid,
  dealer_account_number text,
  dealer_name text,
  origin_type text,
  origin_id uuid,
  original_month_idx integer,
  original_dealer_account_id uuid,
  original_dealer_account_number text,
  original_dealer_name text,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
begin
  for v_line in
    select line.id, line.seller_email
    from public.crm_budget_lines line
    join public.crm_budget_forecasts forecast on forecast.budget_line_id = line.id
    where line.year = p_year
      and forecast.monthly_qty is not null
      and array_length(forecast.monthly_qty, 1) = 12
      and (
        public.is_timan_backend()
        or public.is_timan_budget_seller(line.seller_email)
      )
  loop
    perform public.materialize_crm_working_budget_units(v_line.id);
  end loop;

  return query
  select unit.id, unit.budget_line_id, unit.sequence_no, unit.month_idx,
         unit.dealer_account_id, unit.dealer_account_number, unit.dealer_name,
         unit.origin_type, unit.origin_id, unit.original_month_idx,
         unit.original_dealer_account_id, unit.original_dealer_account_number,
         unit.original_dealer_name, unit.version
  from public.crm_working_budget_units unit
  join public.crm_budget_lines line on line.id = unit.budget_line_id
  where line.year = p_year
    and unit.status = 'active'
    and (
      public.is_timan_backend()
      or public.is_timan_budget_seller(line.seller_email)
    )
  order by unit.budget_line_id, unit.month_idx, unit.sequence_no;
end;
$$;

create or replace function public.create_crm_working_budget_unit(
  p_budget_line_id uuid,
  p_month_idx integer,
  p_expected_value integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.crm_budget_lines%rowtype;
  v_result jsonb;
  v_existing jsonb;
  v_unit public.crm_working_budget_units%rowtype;
  v_sequence integer;
begin
  select * into v_line from public.crm_budget_lines line
  where line.id = p_budget_line_id for update;
  if not found then raise exception 'Working Budget line not found'; end if;
  if not (public.is_timan_backend() or public.is_timan_budget_seller(v_line.seller_email)) then
    raise exception 'Not authorized for this Working Budget scope' using errcode = '42501';
  end if;
  if p_month_idx not between 0 and 11 or p_request_id is null then
    raise exception 'A valid month and request id are required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_budget_line_id::text, 0));
  perform public.materialize_crm_working_budget_units(p_budget_line_id);

  select audit.new_value into v_existing from public.audit_log audit
  where audit.record_type = 'crm_working_budget_adjustment'
    and audit.record_id = p_request_id::text limit 1;
  if v_existing is not null then
    return jsonb_build_object('status', 'already_applied', 'request_id', p_request_id) || v_existing;
  end if;

  perform public.ensure_crm_working_budget_unit_references(p_budget_line_id, p_month_idx);
  v_result := public.adjust_crm_working_budget_quantity(
    p_budget_line_id, p_month_idx, 1, p_expected_value, null, p_request_id
  );
  select coalesce(max(unit.sequence_no), 0) + 1 into v_sequence
  from public.crm_working_budget_units unit
  where unit.budget_line_id = p_budget_line_id;

  insert into public.crm_working_budget_units (
    budget_line_id, sequence_no, month_idx, origin_type,
    materialization_key, created_by, original_month_idx
  ) values (
    p_budget_line_id, v_sequence, p_month_idx, 'manual_add',
    'added:' || p_request_id::text, (select auth.uid()), p_month_idx
  ) returning * into v_unit;

  update public.audit_log
  set new_value = new_value || jsonb_build_object(
        'working_budget_unit_id', v_unit.id,
        'working_budget_unit_sequence', v_unit.sequence_no,
        'original_month_idx', v_unit.original_month_idx
      ),
      changed_fields = array_append(changed_fields, 'working_budget_unit_id')
  where record_type = 'crm_working_budget_adjustment'
    and record_id = p_request_id::text;

  return v_result || jsonb_build_object(
    'unit_id', v_unit.id, 'unit_sequence', v_unit.sequence_no,
    'unit_version', v_unit.version, 'original_month_idx', v_unit.original_month_idx
  );
end;
$$;

create or replace function public.remove_crm_working_budget_unit(
  p_unit_id uuid,
  p_expected_version integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.crm_working_budget_units%rowtype;
  v_line public.crm_budget_lines%rowtype;
  v_forecast public.crm_budget_forecasts%rowtype;
  v_selection jsonb;
  v_result jsonb;
  v_existing jsonb;
begin
  select * into v_unit from public.crm_working_budget_units unit
  where unit.id = p_unit_id for update;
  if not found then raise exception 'Working Budget unit not found'; end if;

  select * into v_line from public.crm_budget_lines line
  where line.id = v_unit.budget_line_id for update;
  if not (public.is_timan_backend() or public.is_timan_budget_seller(v_line.seller_email)) then
    raise exception 'Not authorized for this Working Budget scope' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_unit.budget_line_id::text, 0));

  select audit.new_value into v_existing from public.audit_log audit
  where audit.record_type = 'crm_working_budget_adjustment'
    and audit.record_id = p_request_id::text limit 1;
  if v_existing is not null then
    return jsonb_build_object('status', 'already_applied', 'request_id', p_request_id) || v_existing;
  end if;
  if v_unit.status <> 'active' or v_unit.version <> p_expected_version then
    raise exception 'Working Budget unit changed concurrently; reload before continuing'
      using errcode = '40001';
  end if;

  select * into v_forecast from public.crm_budget_forecasts forecast
  where forecast.budget_line_id = v_unit.budget_line_id for update;
  if not found then raise exception 'Working Budget monthly forecast is not initialized'; end if;

  perform public.ensure_crm_working_budget_unit_references(
    v_unit.budget_line_id, v_unit.month_idx
  );
  v_selection := case when v_unit.dealer_account_id is null
    and v_unit.dealer_account_number is null and v_unit.dealer_name is null
    then jsonb_build_object('kind', 'unallocated', 'quantity', 1)
    else jsonb_build_object(
      'kind', 'dealer', 'dealer_account_id', v_unit.dealer_account_id,
      'dealer_account_number', v_unit.dealer_account_number,
      'dealer_name', v_unit.dealer_name, 'quantity', 1
    ) end;

  v_result := public.adjust_crm_working_budget_quantity(
    v_unit.budget_line_id, v_unit.month_idx, -1,
    coalesce(v_forecast.monthly_qty[v_unit.month_idx + 1], 0),
    v_selection, p_request_id
  );

  update public.crm_working_budget_units
  set status = 'removed', version = version + 1, removed_by = (select auth.uid()),
      removed_at = now(), updated_at = now()
  where id = p_unit_id returning * into v_unit;

  update public.audit_log
  set new_value = new_value || jsonb_build_object(
        'working_budget_unit_id', v_unit.id,
        'working_budget_unit_sequence', v_unit.sequence_no,
        'working_budget_unit_version', v_unit.version,
        'original_month_idx', v_unit.original_month_idx,
        'original_dealer_account_id', v_unit.original_dealer_account_id,
        'original_dealer_account_number', v_unit.original_dealer_account_number,
        'original_dealer_name', v_unit.original_dealer_name
      ),
      changed_fields = array_append(changed_fields, 'working_budget_unit_id')
  where record_type = 'crm_working_budget_adjustment'
    and record_id = p_request_id::text;

  return v_result || jsonb_build_object(
    'unit_id', v_unit.id, 'unit_sequence', v_unit.sequence_no,
    'unit_version', v_unit.version,
    'original_month_idx', v_unit.original_month_idx
  );
end;
$$;

create or replace function public.move_crm_working_budget_unit(
  p_unit_id uuid,
  p_target_month_idx integer,
  p_expected_version integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.crm_working_budget_units%rowtype;
  v_line public.crm_budget_lines%rowtype;
  v_selection jsonb;
  v_result jsonb;
  v_existing jsonb;
  v_source_month_idx integer;
begin
  if p_target_month_idx not between 0 and 11 or p_request_id is null then
    raise exception 'A valid target month and request id are required';
  end if;

  select * into v_unit from public.crm_working_budget_units unit
  where unit.id = p_unit_id for update;
  if not found then raise exception 'Working Budget unit not found'; end if;

  select * into v_line from public.crm_budget_lines line
  where line.id = v_unit.budget_line_id for update;
  if not (public.is_timan_backend() or public.is_timan_budget_seller(v_line.seller_email)) then
    raise exception 'Not authorized for this Working Budget scope' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_unit.budget_line_id::text, 0));

  select audit.new_value into v_existing from public.audit_log audit
  where audit.record_type = 'crm_working_budget_move'
    and audit.record_id = p_request_id::text limit 1;
  if v_existing is not null then
    return jsonb_build_object('status', 'already_applied', 'request_id', p_request_id) || v_existing;
  end if;
  if v_unit.status <> 'active' or v_unit.version <> p_expected_version then
    raise exception 'Working Budget unit changed concurrently; reload before continuing'
      using errcode = '40001';
  end if;
  if v_unit.month_idx = p_target_month_idx then
    raise exception 'Working Budget unit is already in the selected month';
  end if;

  v_source_month_idx := v_unit.month_idx;
  perform public.ensure_crm_working_budget_unit_references(
    v_unit.budget_line_id, v_source_month_idx
  );
  perform public.ensure_crm_working_budget_unit_references(
    v_unit.budget_line_id, p_target_month_idx
  );

  v_selection := case when v_unit.dealer_account_id is null
    and v_unit.dealer_account_number is null and v_unit.dealer_name is null
    then jsonb_build_object('kind', 'unallocated', 'quantity', 1)
    else jsonb_build_object(
      'kind', 'dealer', 'dealer_account_id', v_unit.dealer_account_id,
      'dealer_account_number', v_unit.dealer_account_number,
      'dealer_name', v_unit.dealer_name, 'quantity', 1
    ) end;

  v_result := public.move_crm_working_budget_allocations(
    v_unit.budget_line_id, v_source_month_idx, p_target_month_idx,
    jsonb_build_array(v_selection), p_request_id
  );

  update public.crm_working_budget_units
  set month_idx = p_target_month_idx, version = version + 1, updated_at = now()
  where id = p_unit_id returning * into v_unit;

  update public.audit_log
  set new_value = new_value || jsonb_build_object(
        'working_budget_unit_id', v_unit.id,
        'working_budget_unit_sequence', v_unit.sequence_no,
        'working_budget_unit_version', v_unit.version,
        'original_month_idx', v_unit.original_month_idx,
        'original_dealer_account_id', v_unit.original_dealer_account_id,
        'original_dealer_account_number', v_unit.original_dealer_account_number,
        'original_dealer_name', v_unit.original_dealer_name
      ),
      changed_fields = array_append(changed_fields, 'working_budget_unit_id')
  where record_type = 'crm_working_budget_move'
    and record_id = p_request_id::text;

  return v_result || jsonb_build_object(
    'unit_id', v_unit.id, 'unit_sequence', v_unit.sequence_no,
    'unit_version', v_unit.version,
    'source_month_idx', v_source_month_idx,
    'destination_month_idx', p_target_month_idx,
    'original_month_idx', v_unit.original_month_idx
  );
end;
$$;

revoke all on function public.list_crm_working_budget_units(uuid)
  from public, anon;
revoke all on function public.list_crm_working_budget_units_for_year(integer)
  from public, anon;
revoke all on function public.create_crm_working_budget_unit(uuid, integer, integer, uuid)
  from public, anon;
revoke all on function public.remove_crm_working_budget_unit(uuid, integer, uuid)
  from public, anon;
revoke all on function public.move_crm_working_budget_unit(uuid, integer, integer, uuid)
  from public, anon;

grant execute on function public.list_crm_working_budget_units(uuid) to authenticated;
grant execute on function public.list_crm_working_budget_units_for_year(integer) to authenticated;
grant execute on function public.create_crm_working_budget_unit(uuid, integer, integer, uuid) to authenticated;
grant execute on function public.remove_crm_working_budget_unit(uuid, integer, uuid) to authenticated;
grant execute on function public.move_crm_working_budget_unit(uuid, integer, integer, uuid) to authenticated;
