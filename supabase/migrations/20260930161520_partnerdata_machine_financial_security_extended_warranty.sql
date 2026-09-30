-- Partnerdata machine security and exact extended-warranty evidence.
--
-- Cost price and contribution amount are moved behind backend-only RLS while
-- the already-visible contribution percentage stays available to scoped Timan
-- sellers. Extended warranty is attached only to an exact serial through a
-- canonical C5 item number or an unambiguous Portal order/unit relation.

create table if not exists public.machine_financial_margins (
  warranty_registration_id uuid primary key references public.warranty_registrations(id) on delete restrict,
  cost_amount numeric,
  contribution_margin_amount numeric,
  updated_at timestamptz not null default now()
);

create table if not exists public.machine_financial_percentages (
  warranty_registration_id uuid primary key references public.warranty_registrations(id) on delete restrict,
  contribution_margin_percent numeric,
  updated_at timestamptz not null default now()
);

alter table public.machine_financial_margins enable row level security;
alter table public.machine_financial_percentages enable row level security;

drop policy if exists machine_financial_margins_backend_select on public.machine_financial_margins;
create policy machine_financial_margins_backend_select
  on public.machine_financial_margins for select to authenticated
  using (public.is_timan_backend());

drop policy if exists machine_financial_percentages_internal_select on public.machine_financial_percentages;
create policy machine_financial_percentages_internal_select
  on public.machine_financial_percentages for select to authenticated
  using (
    public.is_timan_global_warranty()
    or exists (
      select 1
      from public.warranty_registrations wr
      where wr.id = machine_financial_percentages.warranty_registration_id
        and exists (
          select 1
          from public.app_users actor
          where actor.portal_role = 'timan_seller'
            and coalesce(actor.is_active, false)
            and coalesce(actor.approved, false)
            and (
              actor.auth_user_id = auth.uid()
              or lower(trim(actor.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
            )
        )
        and wr.dealer_account_id in (select public.warranty_visible_dealer_ids())
    )
  );

revoke all on public.machine_financial_margins, public.machine_financial_percentages from public, anon;
grant select on public.machine_financial_margins, public.machine_financial_percentages to authenticated;
grant all on public.machine_financial_margins, public.machine_financial_percentages to service_role;

insert into public.machine_financial_margins (
  warranty_registration_id, cost_amount, contribution_margin_amount, updated_at
)
select id, legacy_cost_amount, legacy_contribution_margin_amount, coalesce(legacy_sales_updated_at, updated_at, now())
from public.warranty_registrations
where legacy_cost_amount is not null or legacy_contribution_margin_amount is not null
on conflict (warranty_registration_id) do update set
  cost_amount = excluded.cost_amount,
  contribution_margin_amount = excluded.contribution_margin_amount,
  updated_at = excluded.updated_at;

insert into public.machine_financial_percentages (
  warranty_registration_id, contribution_margin_percent, updated_at
)
select id, legacy_contribution_margin_amount / nullif(legacy_revenue, 0), coalesce(legacy_sales_updated_at, updated_at, now())
from public.warranty_registrations
where legacy_contribution_margin_amount is not null and nullif(legacy_revenue, 0) is not null
on conflict (warranty_registration_id) do update set
  contribution_margin_percent = excluded.contribution_margin_percent,
  updated_at = excluded.updated_at;

create or replace function public.sync_machine_financial_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.legacy_cost_amount is not null or new.legacy_contribution_margin_amount is not null then
    insert into public.machine_financial_margins (
      warranty_registration_id, cost_amount, contribution_margin_amount, updated_at
    ) values (
      new.id, new.legacy_cost_amount, new.legacy_contribution_margin_amount, now()
    ) on conflict (warranty_registration_id) do update set
      cost_amount = excluded.cost_amount,
      contribution_margin_amount = excluded.contribution_margin_amount,
      updated_at = excluded.updated_at;
  else
    delete from public.machine_financial_margins where warranty_registration_id = new.id;
  end if;

  if new.legacy_contribution_margin_amount is not null and nullif(new.legacy_revenue, 0) is not null then
    insert into public.machine_financial_percentages (
      warranty_registration_id, contribution_margin_percent, updated_at
    ) values (
      new.id, new.legacy_contribution_margin_amount / nullif(new.legacy_revenue, 0), now()
    ) on conflict (warranty_registration_id) do update set
      contribution_margin_percent = excluded.contribution_margin_percent,
      updated_at = excluded.updated_at;
  else
    delete from public.machine_financial_percentages where warranty_registration_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_machine_financial_security() from public, anon, authenticated;
drop trigger if exists trg_sync_machine_financial_security on public.warranty_registrations;
create trigger trg_sync_machine_financial_security
after insert or update of legacy_revenue, legacy_cost_amount, legacy_contribution_margin_amount
on public.warranty_registrations
for each row execute function public.sync_machine_financial_security();

-- Remove the direct Data API path to the two sensitive legacy columns. The
-- backend-only read table above remains the canonical source used by the RPC.
revoke select on public.warranty_registrations from authenticated;
do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
  into v_columns
  from pg_attribute a
  where a.attrelid = 'public.warranty_registrations'::regclass
    and a.attnum > 0
    and not a.attisdropped
    and a.attname not in ('legacy_cost_amount', 'legacy_contribution_margin_amount');
  execute 'grant select (' || v_columns || ') on public.warranty_registrations to authenticated';
end;
$$;

alter table public.warranty_registrations
  add column if not exists legacy_portal_order_number text,
  add column if not exists extended_warranty_item_number text,
  add column if not exists extended_warranty_source text,
  add column if not exists extended_warranty_detected_at timestamptz;

grant select (
  legacy_portal_order_number,
  extended_warranty_item_number,
  extended_warranty_source,
  extended_warranty_detected_at
) on public.warranty_registrations to authenticated;

alter table public.warranty_registrations
  drop constraint if exists warranty_registrations_extended_warranty_item_check,
  add constraint warranty_registrations_extended_warranty_item_check
    check (extended_warranty_item_number is null or extended_warranty_item_number in ('795015', '795016', '795018')),
  drop constraint if exists warranty_registrations_extended_warranty_source_check,
  add constraint warranty_registrations_extended_warranty_source_check
    check (extended_warranty_source is null or extended_warranty_source in ('portal_configuration', 'c5_erp'));

create index if not exists warranty_registrations_extended_warranty_serial_idx
  on public.warranty_registrations (machine_serial_number)
  where extended_warranty_item_number is not null;
create index if not exists warranty_registrations_portal_order_idx
  on public.warranty_registrations (legacy_portal_order_number)
  where legacy_portal_order_number is not null;

create or replace function public.is_canonical_extended_warranty_product(
  p_item_number text,
  p_machine_model text
)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select case nullif(btrim(coalesce(p_item_number, '')), '')
    when '795015' then upper(regexp_replace(coalesce(p_machine_model, ''), '[^A-Za-z0-9]+', '', 'g')) like '%RC751%'
    when '795016' then upper(regexp_replace(coalesce(p_machine_model, ''), '[^A-Za-z0-9]+', '', 'g')) like '%RC1000%'
    when '795018' then upper(regexp_replace(coalesce(p_machine_model, ''), '[^A-Za-z0-9]+', '', 'g')) like '%3330%'
    else false
  end;
$$;
revoke all on function public.is_canonical_extended_warranty_product(text, text) from public, anon;
grant execute on function public.is_canonical_extended_warranty_product(text, text) to authenticated;

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
  with matching_configurations as (
    select c.id
    from public.configurations c
    where upper(btrim(c.order_number)) = upper(btrim(p_order_number))
      and (
        nullif(btrim(p_unit_key), '') is not null
        or (select coalesce(sum(greatest(coalesce(ci.machine_qty, 0), 0)), 0)
            from public.configuration_items ci where ci.configuration_id = c.id) = 1
      )
  ), products(item_number) as (
    values ('795015'::text), ('795016'::text), ('795018'::text)
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

-- Extend the existing C5/ERP enrichment. A direct C5 item is strongest. A
-- Portal order is accepted only when the saved configuration resolves to one
-- exact machine (or an explicit configuration unit key).
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'enrich_legacy_machine_sales'
    and pg_get_function_identity_arguments(p.oid) = 'p_rows jsonb';

  if v_definition is null
    or position('v_unmatched integer := 0;' in v_definition) = 0
    or position('legacy_sales_updated_at = now()' in v_definition) = 0
    or position('if found then v_updated := v_updated + 1; else v_unmatched := v_unmatched + 1; end if;' in v_definition) = 0 then
    raise exception 'enrich_legacy_machine_sales does not match the expected import contract';
  end if;

  v_definition := replace(v_definition,
    'v_unmatched integer := 0;',
    $patch$v_unmatched integer := 0;
  v_warranty_matched integer := 0;
  v_warranty_ambiguous integer := 0;
  v_registration_id uuid;
  v_machine_model text;
  v_direct_item text;
  v_portal_item text;
  v_portal_order text;
  v_unit_key text;$patch$);

  v_definition := replace(v_definition,
    'legacy_sales_updated_at = now()',
    $patch$legacy_sales_updated_at = now(),
      legacy_portal_order_number = coalesce(nullif(trim(v_row ->> 'portalOrderNumber'), ''), wr.legacy_portal_order_number)$patch$);

  v_definition := replace(v_definition,
    $old$if found then v_updated := v_updated + 1; else v_unmatched := v_unmatched + 1; end if;$old$,
    $patch$if found then
      v_updated := v_updated + 1;
      select wr.id, wr.machine_model into v_registration_id, v_machine_model
      from public.warranty_registrations wr
      where wr.source = 'legacy_machine_import'
        and upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) = v_serial_key
      order by wr.updated_at desc, wr.id
      limit 1;

      v_direct_item := nullif(trim(v_row ->> 'extendedWarrantyItemNumber'), '');
      v_portal_order := nullif(trim(v_row ->> 'portalOrderNumber'), '');
      v_unit_key := nullif(trim(v_row ->> 'configurationUnitKey'), '');
      v_portal_item := null;

      if v_direct_item is not null then
        if public.is_canonical_extended_warranty_product(v_direct_item, v_machine_model) then
          update public.warranty_registrations
          set extended_warranty_item_number = v_direct_item,
              extended_warranty_source = 'c5_erp',
              extended_warranty_detected_at = now()
          where id = v_registration_id;
          v_warranty_matched := v_warranty_matched + 1;
        else
          v_warranty_ambiguous := v_warranty_ambiguous + 1;
        end if;
      elsif v_portal_order is not null then
        v_portal_item := public.resolve_portal_extended_warranty_item(v_portal_order, v_machine_model, v_unit_key);
        if v_portal_item is not null then
          update public.warranty_registrations
          set extended_warranty_item_number = v_portal_item,
              extended_warranty_source = 'portal_configuration',
              extended_warranty_detected_at = now()
          where id = v_registration_id;
          v_warranty_matched := v_warranty_matched + 1;
        elsif exists (
          select 1 from public.configurations c
          join public.configuration_items ci on ci.configuration_id = c.id
          where upper(btrim(c.order_number)) = upper(btrim(v_portal_order))
            and (coalesce(ci.accessories, '[]'::jsonb) ?| array['795015','795016','795018']
              or ci.unit_configs::text ~ '795015|795016|795018')
        ) then
          v_warranty_ambiguous := v_warranty_ambiguous + 1;
        end if;
      end if;
    else
      v_unmatched := v_unmatched + 1;
    end if;$patch$);

  v_definition := replace(v_definition,
    $old$return jsonb_build_object('updated', v_updated, 'unmatched', v_unmatched);$old$,
    $patch$return jsonb_build_object(
    'updated', v_updated,
    'unmatched', v_unmatched,
    'warrantyMatched', v_warranty_matched,
    'warrantyAmbiguous', v_warranty_ambiguous
  );$patch$);

  execute v_definition;
end;
$$;

-- Patch the one canonical registry query. The margin tables enforce role
-- security before JSON is built; the Portal presentation wrapper below also
-- removes backend margins while Backend is using Seller View-as.
do $$
declare
  v_definition text;
  v_signature text :=
    'p_allowed_dealers text[], p_query text, p_dealer text, p_model text, p_warranty_type text, p_health text, p_warranty_match text, p_demo_only boolean, p_date_from date, p_date_to date, p_sort text, p_direction text, p_limit integer, p_offset integer';
  v_old_payload text := '''revenue'',case when (select can_view_financials from request_access) then revenue else null end,''costAmount'',case when (select can_view_financials from request_access) then cost_amount else null end,''contributionMarginAmount'',case when (select can_view_financials from request_access) then contribution_margin_amount else null end,''grossSalesPrice'',case when (select can_view_financials from request_access) then gross_sales_price else null end,''discountAmount'',case when (select can_view_financials from request_access) then discount_amount else null end,''discountPercent'',case when (select can_view_financials from request_access) then discount_percent else null end,''isDemo'',is_demo,';
  v_new_payload text := '''revenue'',case when (select can_view_financials from request_access) then revenue else null end,''costAmount'',cost_amount,''contributionMarginAmount'',contribution_margin_amount,''contributionMarginPercent'',case when (select can_view_financials from request_access) then contribution_margin_percent else null end,''grossSalesPrice'',case when (select can_view_financials from request_access) then gross_sales_price else null end,''discountAmount'',case when (select can_view_financials from request_access) then discount_amount else null end,''discountPercent'',case when (select can_view_financials from request_access) then discount_percent else null end,''hasExtendedWarranty'',has_extended_warranty,''isDemo'',is_demo,';
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'machine_registry_page_scoped'
    and pg_get_function_identity_arguments(p.oid) = v_signature;

  if v_definition is null
    or position('wr.legacy_cost_amount cost_amount' in v_definition) = 0
    or position(v_old_payload in v_definition) = 0
    or position('null::text portal_order_number' in v_definition) = 0 then
    raise exception 'machine_registry_page_scoped does not match the expected financial read model';
  end if;

  v_definition := replace(v_definition,
    $old$wr.legacy_invoice_number invoice_number, wr.legacy_revenue revenue, wr.legacy_cost_amount cost_amount,
    wr.legacy_contribution_margin_amount contribution_margin_amount,$old$,
    $patch$wr.legacy_invoice_number invoice_number, wr.legacy_revenue revenue,
    margin_values.cost_amount, margin_values.contribution_margin_amount,
    margin_percentages.contribution_margin_percent,$patch$);

  v_definition := replace(v_definition,
    $old$from public.warranty_registrations wr
  where wr.source = 'legacy_machine_import'$old$,
    $patch$from public.warranty_registrations wr
  left join public.machine_financial_margins margin_values on margin_values.warranty_registration_id = wr.id
  left join public.machine_financial_percentages margin_percentages on margin_percentages.warranty_registration_id = wr.id
  where wr.source = 'legacy_machine_import'$patch$);

  v_definition := replace(v_definition,
    '), canonical as (',
    $patch$), extended_warranty as (
  select upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) normalized_serial,
    bool_or(public.is_canonical_extended_warranty_product(wr.extended_warranty_item_number, wr.machine_model)) has_extended_warranty
  from public.warranty_registrations wr
  where wr.is_active_in_source and wr.extended_warranty_item_number is not null
  group by upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g'))
), canonical as ($patch$);

  v_definition := replace(v_definition,
    $old$null::text portal_order_number, lc.invoice_number, lc.revenue, lc.cost_amount, lc.contribution_margin_amount,
    lc.gross_sales_price,$old$,
    $patch$lc.legacy_portal_order_number portal_order_number, lc.invoice_number, lc.revenue, lc.cost_amount, lc.contribution_margin_amount,
    lc.contribution_margin_percent, coalesce(extended.has_extended_warranty, false) has_extended_warranty,
    lc.gross_sales_price,$patch$);

  -- The legacy CTE exposes the exact Portal order carried by C5 sync.
  v_definition := replace(v_definition,
    $old$wr.legacy_warranty_reference machine_order_number, wr.legacy_erp_order_number erp_order_number,$old$,
    $patch$wr.legacy_warranty_reference machine_order_number, wr.legacy_erp_order_number erp_order_number,
    wr.legacy_portal_order_number,$patch$);

  v_definition := replace(v_definition,
    $old$left join legacy_commercial lc on lc.normalized_serial = upper(regexp_replace(wr.machine_serial_number,'[^A-Za-z0-9]+','','g'))$old$,
    $patch$left join legacy_commercial lc on lc.normalized_serial = upper(regexp_replace(wr.machine_serial_number,'[^A-Za-z0-9]+','','g'))
  left join extended_warranty extended on extended.normalized_serial = upper(regexp_replace(wr.machine_serial_number,'[^A-Za-z0-9]+','','g'))$patch$);

  v_definition := replace(v_definition,
    $old$case when p_sort='marginPercent' and p_direction='asc' then contribution_margin_amount / nullif(revenue,0) end asc nulls last, case when p_sort='marginPercent' and p_direction='desc' then contribution_margin_amount / nullif(revenue,0) end desc nulls last,$old$,
    $patch$case when p_sort='marginPercent' and p_direction='asc' then contribution_margin_percent end asc nulls last, case when p_sort='marginPercent' and p_direction='desc' then contribution_margin_percent end desc nulls last,$patch$);

  v_definition := replace(v_definition, v_old_payload, v_new_payload);
  execute v_definition;
end;
$$;

alter function public.machine_registry_page_scoped(text[],text,text,text,text,text,text,boolean,date,date,text,text,integer,integer)
  rename to machine_registry_page_scoped_authorized_base;

create function public.machine_registry_page_scoped(
  p_allowed_dealers text[] default null, p_query text default null, p_dealer text default null,
  p_model text default null, p_warranty_type text default 'all', p_health text default 'all',
  p_warranty_match text default 'all', p_demo_only boolean default false,
  p_date_from date default null, p_date_to date default null, p_sort text default 'activity',
  p_direction text default 'desc', p_limit integer default 50, p_offset integer default 0,
  p_include_backend_margins boolean default false
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
with registry as (
  select public.machine_registry_page_scoped_authorized_base(
    p_allowed_dealers, p_query, p_dealer, p_model, p_warranty_type, p_health,
    p_warranty_match, p_demo_only, p_date_from, p_date_to, p_sort, p_direction,
    p_limit, p_offset
  ) page
), presented_rows as (
  select coalesce(jsonb_agg(
    case
      when coalesce(p_include_backend_margins, false) and public.is_timan_backend() then row_data
      else row_data || jsonb_build_object('costAmount', null, 'contributionMarginAmount', null)
    end
    order by ordinal
  ), '[]'::jsonb) rows
  from registry
  cross join lateral jsonb_array_elements(registry.page -> 'rows') with ordinality as item(row_data, ordinal)
)
select jsonb_set(registry.page, '{rows}', presented_rows.rows)
from registry cross join presented_rows;
$$;

revoke all on function public.machine_registry_page_scoped_authorized_base(text[],text,text,text,text,text,text,boolean,date,date,text,text,integer,integer) from public, anon;
grant execute on function public.machine_registry_page_scoped_authorized_base(text[],text,text,text,text,text,text,boolean,date,date,text,text,integer,integer) to authenticated;
revoke all on function public.machine_registry_page_scoped(text[],text,text,text,text,text,text,boolean,date,date,text,text,integer,integer,boolean) from public, anon;
grant execute on function public.machine_registry_page_scoped(text[],text,text,text,text,text,text,boolean,date,date,text,text,integer,integer,boolean) to authenticated;
