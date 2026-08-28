create or replace function public.crm_leads_page_query(
  p_is_admin boolean default false,
  p_owner_user_id uuid default null,
  p_owner_email text default null,
  p_shared_lead_ids uuid[] default '{}'::uuid[],
  p_external_dealer_ids uuid[] default '{}'::uuid[],
  p_external_dealer_names text[] default '{}'::text[],
  p_tab text default 'open',
  p_followup_filter text default null,
  p_type_filter text default null,
  p_machine_filter text default null,
  p_equipment_filter text default null,
  p_status_filter text default null,
  p_search text default null,
  p_sort text default 'default',
  p_limit integer default 50,
  p_offset integer default 0,
  p_now timestamptz default now()
)
returns jsonb
language sql
stable
set search_path = public
as $$
with args as (
  select
    greatest(1, least(coalesce(p_limit, 50), 100)) as page_limit,
    greatest(0, coalesce(p_offset, 0)) as page_offset,
    nullif(trim(coalesce(p_search, '')), '') as search_text,
    lower(nullif(trim(coalesce(p_owner_email, '')), '')) as owner_email,
    coalesce(p_shared_lead_ids, '{}'::uuid[]) as shared_lead_ids,
    coalesce(p_external_dealer_ids, '{}'::uuid[]) as external_dealer_ids,
    coalesce(p_external_dealer_names, '{}'::text[]) as external_dealer_names,
    (timezone('Europe/Copenhagen', coalesce(p_now, now())))::date as today
),
demo_source_leads as (
  select distinct source_lead_id
  from public.crm_demo_leads
  where source_lead_id is not null
),
latest_quotes as (
  select distinct on (lead_id)
    lead_id,
    id as quote_id
  from public.configurations
  where lead_id is not null
    and document_type = 'quote'
    and quote_number is not null
    and coalesce(lower(case_status), '') not in ('deleted', 'ordre_afgivet')
    and coalesce(lower(status), '') <> 'ordre_afgivet'
    and (
      p_is_admin
      or p_owner_user_id is null
      or assigned_seller_id = p_owner_user_id
      or created_by_user_id = p_owner_user_id
      or lower(coalesce(seller_email, '')) = (select owner_email from args)
    )
  order by lead_id, coalesce(quote_sent_at, last_saved_at, created_at) desc
),
open_rows as (
  select
    l.id,
    'open'::text as row_type,
    case
      when l.lead_no is null then '—'
      when l.lead_no >= 5000 then 'G-' || l.lead_no::text
      else 'L-' || l.lead_no::text
    end as display_no,
    l.title,
    l.contact_information as customer,
    coalesce(d.company_name, l.linked_dealer_id::text) as dealer,
    l.linked_dealer_id,
    l.owner_user_id,
    l.owner_name,
    l.owner_email,
    l.owner_name as responsible_name,
    array_to_string(coalesce(l.machine_types, '{}'::text[]), ', ') as machine,
    null::text as equipment,
    coalesce(l.first_contact_date::text, l.created_at::text) as row_date,
    l.next_followup_date::text as next_followup,
    case coalesce(
      nullif(trim(l.next_activity), ''),
      case l.pipeline_stage
        when 'Lead' then 'Wants to be contacted'
        when 'Qualified' then 'Follow-up on leads'
        when 'Offer sent' then 'Offer sent to the customer'
        when 'Negotiation' then 'Follow-up on leads'
        when 'Won' then 'Closed with order'
        when 'Lost' then 'Closed without order'
        else null
      end
    )
      when 'Customer requests a demonstration' then 'Demo planlagt'
      when 'Offer sent to the customer' then 'Tilbud sendt'
      when 'Closed with order' then 'Vundet'
      when 'Closed without order' then 'Tabt'
      when 'Not relevant' then 'Tabt'
      when 'Follow-up on leads' then 'Follow-up'
      else 'Lead'
    end as display_status,
    case coalesce(
      nullif(trim(l.next_activity), ''),
      case l.pipeline_stage
        when 'Lead' then 'Wants to be contacted'
        when 'Qualified' then 'Follow-up on leads'
        when 'Offer sent' then 'Offer sent to the customer'
        when 'Negotiation' then 'Follow-up on leads'
        when 'Won' then 'Closed with order'
        when 'Lost' then 'Closed without order'
        else null
      end
    )
      when 'Wants to be contacted' then 15
      when 'Lead sent to the dealer' then 10
      when 'Sales material sent to the customer' then 30
      when 'Customer requests a demonstration' then 50
      when 'Follow-up on leads' then 25
      when 'Offer sent to the customer' then 70
      when 'Closed with order' then 100
      when 'Closed without order' then 0
      when 'Not relevant' then 0
      when 'New lead' then 10
      else coalesce(l.probability, 10)
    end as probability,
    coalesce(l.estimated_value, 0)::numeric as row_value,
    coalesce(l.attachments, '[]'::jsonb) as attachments,
    (
      l.demo_has_run = 'yes'
      or l.converted_demo_lead_id is not null
      or dsl.source_lead_id is not null
    ) as has_demo,
    coalesce(l.incomplete_from_configurator, false) as incomplete,
    l.created_at,
    l.updated_at,
    l.lead_no::text as raw_no,
    l.id = any(coalesce(p_shared_lead_ids, '{}'::uuid[])) as shared,
    lq.quote_id
  from public.crm_leads l
  left join public.dealer_accounts d on d.id = l.linked_dealer_id
  left join demo_source_leads dsl on dsl.source_lead_id = l.id
  left join latest_quotes lq on lq.lead_id = l.id
),
demo_rows as (
  select
    d.id,
    'demo'::text as row_type,
    case when d.demo_no is null then '—' else 'D-' || d.demo_no::text end as display_no,
    d.title,
    d.customer_name as customer,
    d.dealer_company as dealer,
    null::uuid as linked_dealer_id,
    d.owner_user_id,
    d.owner_name,
    d.owner_email,
    d.owner_name as responsible_name,
    d.demo_machine as machine,
    array_to_string(coalesce(d.demo_equipment, '{}'::text[]), ', ') as equipment,
    coalesce(d.demo_date::text, d.created_at::text) as row_date,
    d.followup_date::text as next_followup,
    d.result_status as display_status,
    null::integer as probability,
    coalesce(d.estimated_value, 0)::numeric as row_value,
    coalesce(d.attachments, '[]'::jsonb) as attachments,
    true as has_demo,
    false as incomplete,
    d.created_at,
    d.created_at as updated_at,
    d.demo_no::text as raw_no,
    false as shared,
    null::uuid as quote_id
  from public.crm_demo_leads d
),
unified_rows as (
  select * from open_rows
  union all
  select * from demo_rows
),
scoped_rows as (
  select r.*
  from unified_rows r, args a
  where
    p_is_admin
    or (
      cardinality(a.external_dealer_ids) > 0
      and (
        (r.row_type = 'open' and r.linked_dealer_id = any(a.external_dealer_ids))
        or lower(trim(coalesce(r.dealer, ''))) = any(a.external_dealer_names)
      )
    )
    or (
      cardinality(a.external_dealer_names) > 0
      and lower(trim(coalesce(r.dealer, ''))) = any(a.external_dealer_names)
    )
    or (
      p_owner_user_id is not null
      and r.owner_user_id = p_owner_user_id
    )
    or (
      r.row_type = 'open'
      and r.id = any(a.shared_lead_ids)
    )
    or (
      a.owner_email is not null
      and lower(coalesce(r.owner_email, '')) = a.owner_email
    )
    or (
      a.owner_email is not null
      and lower(coalesce(r.responsible_name, '')) = a.owner_email
    )
),
classified_rows as (
  select
    r.*,
    case
      when r.display_status in ('Vundet', 'Won') then 'won'
      when r.display_status in ('Tabt', 'Lost', 'No fit') then 'lost'
      when r.row_type = 'demo' or r.has_demo then 'demo'
      else 'open'
    end as user_type,
    case
      when r.display_status in ('Vundet', 'Won') then 'won'
      when r.display_status in ('Tabt', 'Lost', 'No fit') then 'closed'
      else 'open'
    end as tab_bucket,
    case
      when r.next_followup is null then 'neutral'
      when (r.next_followup::date - (select today from args)) < 0 then 'overdue'
      when (r.next_followup::date - (select today from args)) <= 20 then 'soon'
      else 'later'
    end as followup_tone,
    concat_ws(' ', r.display_no, r.title, r.customer, r.dealer, r.owner_name, r.owner_email, r.responsible_name, r.machine, r.equipment, r.display_status) as search_blob
  from scoped_rows r
),
counts as (
  select
    count(*)::int as all_count,
    count(*) filter (where tab_bucket = 'open')::int as open_count,
    count(*) filter (where tab_bucket = 'won')::int as won_count,
    count(*) filter (where tab_bucket = 'closed')::int as closed_count,
    count(*) filter (where tab_bucket = 'open' and followup_tone = 'overdue')::int as overdue_count,
    count(*) filter (where tab_bucket = 'open' and followup_tone = 'soon')::int as soon_count,
    count(*) filter (where tab_bucket = 'open' and followup_tone = 'later')::int as later_count,
    count(*) filter (where owner_user_id is null)::int as unassigned_count
  from classified_rows
),
option_rows as (
  select
    coalesce(jsonb_agg(distinct user_type) filter (where user_type is not null), '[]'::jsonb) as type_options,
    coalesce(jsonb_agg(distinct machine) filter (where nullif(machine, '') is not null and machine <> '—'), '[]'::jsonb) as machine_options,
    coalesce(jsonb_agg(distinct equipment) filter (where nullif(equipment, '') is not null and equipment <> '—'), '[]'::jsonb) as equipment_options,
    coalesce(jsonb_agg(distinct jsonb_build_object(
      'value', display_status || '::' || coalesce(probability::text, ''),
      'status', display_status,
      'probability', probability
    )) filter (where nullif(display_status, '') is not null), '[]'::jsonb) as status_options
  from classified_rows
),
filtered_rows as (
  select r.*
  from classified_rows r, args a
  where
    case coalesce(p_tab, 'open')
      when 'open' then r.tab_bucket = 'open'
      when 'won' then r.tab_bucket = 'won'
      when 'closed' then r.tab_bucket = 'closed'
      else true
    end
    and (
      p_followup_filter is null
      or (r.tab_bucket = 'open' and r.followup_tone = p_followup_filter)
    )
    and (p_type_filter is null or p_type_filter = '' or r.user_type = p_type_filter)
    and (
      p_machine_filter is null
      or p_machine_filter = ''
      or exists (
        select 1
        from unnest(string_to_array(coalesce(r.machine, ''), ',')) part
        where trim(part) = p_machine_filter
      )
    )
    and (
      p_equipment_filter is null
      or p_equipment_filter = ''
      or exists (
        select 1
        from unnest(string_to_array(coalesce(r.equipment, ''), ',')) part
        where trim(part) = p_equipment_filter
      )
    )
    and (p_status_filter is null or p_status_filter = '' or p_status_filter = (r.display_status || '::' || coalesce(r.probability::text, '')))
    and (
      a.search_text is null
      or lower(r.search_blob) like '%' || lower(a.search_text) || '%'
      or regexp_replace(lower(r.search_blob), '[^a-z0-9]', '', 'g') like '%' || regexp_replace(lower(a.search_text), '[^a-z0-9]', '', 'g') || '%'
    )
),
filtered_totals as (
  select
    count(*)::int as total_count,
    coalesce(sum(row_value), 0)::numeric as total_value
  from filtered_rows
),
ordered_rows as (
  select r.*
  from filtered_rows r
  order by
    case when p_sort = 'title_asc' then lower(coalesce(title, '')) end asc,
    case when p_sort = 'title_desc' then lower(coalesce(title, '')) end desc,
    case when p_sort = 'date_asc' then row_date end asc,
    case when p_sort = 'date_desc' then row_date end desc,
    case when p_sort = 'prob_asc' then coalesce(probability, 999) end asc,
    case when p_sort = 'prob_desc' then coalesce(probability, -1) end desc,
    case when p_sort = 'default' and display_no like 'G-%' then 1 else 0 end asc,
    case when p_sort = 'default' then row_date end desc,
    created_at desc
),
page_rows as (
  select ordered_rows.*
  from ordered_rows
  limit (select page_limit from args)
  offset (select page_offset from args)
)
select jsonb_build_object(
  'rows', coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'display_no', display_no,
    'type', row_type,
    'title', title,
    'customer', customer,
    'dealer', dealer,
    'owner_user_id', owner_user_id,
    'owner_name', owner_name,
    'owner_email', owner_email,
    'responsible_name', responsible_name,
    'machine', machine,
    'equipment', equipment,
    'date', row_date,
    'next_followup', next_followup,
    'status', display_status,
    'probability', probability,
    'value', row_value,
    'detail_href', case when row_type = 'demo' then '/portal/crm/demo-leads/' || id::text else '/portal/crm/leads/' || id::text end,
    'attachments', attachments,
    'has_demo', has_demo,
    'incomplete', incomplete,
    'shared', shared,
    'quote_id', quote_id
  )), '[]'::jsonb),
  'counts', jsonb_build_object(
    'all', (select all_count from counts),
    'open', (select open_count from counts),
    'won', (select won_count from counts),
    'closed', (select closed_count from counts)
  ),
  'followup_counts', jsonb_build_object(
    'overdue', (select overdue_count from counts),
    'soon', (select soon_count from counts),
    'later', (select later_count from counts)
  ),
  'unassigned_count', (select unassigned_count from counts),
  'total_count', (select total_count from filtered_totals),
  'total_value', (select total_value from filtered_totals),
  'page_limit', (select page_limit from args),
  'page_offset', (select page_offset from args),
  'options', jsonb_build_object(
    'types', (select type_options from option_rows),
    'machines', (select machine_options from option_rows),
    'equipment', (select equipment_options from option_rows),
    'statuses', (select status_options from option_rows)
  ),
  'raw_records_scanned', jsonb_build_object(
    'crm_leads', (select count(*) from open_rows),
    'crm_demo_leads', (select count(*) from demo_rows),
    'scoped_rows', (select count(*) from scoped_rows)
  )
)
from page_rows;
$$;

revoke all on function public.crm_leads_page_query(
  boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz
) from public, anon;
grant execute on function public.crm_leads_page_query(
  boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz
) to authenticated;

create index if not exists idx_crm_leads_owner_followup
  on public.crm_leads (owner_user_id, next_followup_date);

create index if not exists idx_crm_demo_leads_owner_followup
  on public.crm_demo_leads (owner_user_id, followup_date);

create index if not exists idx_configurations_lead_quote_lookup
  on public.configurations (lead_id, document_type, quote_sent_at desc, last_saved_at desc, created_at desc)
  where lead_id is not null and document_type = 'quote';
