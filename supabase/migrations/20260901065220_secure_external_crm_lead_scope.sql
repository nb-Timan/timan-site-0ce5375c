-- SECURITY: CRM module access is not CRM data access.
-- Account 100 / Timan is used as an internal/default CRM account and must not
-- become an implicit external dealer scope.

create or replace function public.is_protected_internal_crm_account(
  p_account_number text,
  p_company_name text default null,
  p_branch_name text default null
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(trim(coalesce(p_account_number, ''))) = '100'
    and (
      lower(trim(coalesce(p_company_name, ''))) = 'timan'
      or lower(trim(coalesce(p_branch_name, ''))) = 'timan'
    );
$$;

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
with caller as (
  select
    au.id,
    lower(trim(au.email)) as email,
    au.dealer_number,
    coalesce(au.portal_role::text, au.role) as portal_role,
    coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service') as is_internal,
    coalesce(au.portal_role::text, au.role) = 'timan_seller' as is_seller,
    coalesce(au.portal_role::text, au.role) in ('timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_customer', 'dealer_user') as is_external
  from public.app_users au
  where coalesce(au.approved, false) = true
    and coalesce(au.is_active, false) = true
    and (
      au.auth_user_id = (select auth.uid())
      or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
    )
  order by (au.auth_user_id = (select auth.uid())) desc
  limit 1
),
args as (
  select
    greatest(1, least(coalesce(p_limit, 50), 100)) as page_limit,
    greatest(0, coalesce(p_offset, 0)) as page_offset,
    nullif(trim(coalesce(p_search, '')), '') as search_text,
    case
      when c.is_internal then lower(nullif(trim(coalesce(p_owner_email, '')), ''))
      when c.is_seller then c.email
      else null
    end as owner_email,
    case
      when c.is_internal then p_owner_user_id
      when c.is_seller then c.id
      else null
    end as owner_user_id,
    (c.is_internal and p_is_admin) as is_admin,
    c.id as caller_user_id,
    c.dealer_number as caller_dealer_number,
    c.portal_role as caller_role,
    c.is_external,
    (timezone('Europe/Copenhagen', coalesce(p_now, now())))::date as today
  from caller c
),
external_dealer_rows as (
  select distinct da.id, da.account_number, da.company_name, da.branch_name
  from caller c
  join public.dealer_accounts own on own.account_number = c.dealer_number
  join public.dealer_accounts da on (
    da.id = own.id
    or (
      c.portal_role in ('timan_dealer', 'dealer_user', 'dealer_customer', 'timan_importer')
      and da.parent_account_number = c.dealer_number
    )
    or (
      c.portal_role = 'timan_service_partner'
      and exists (
        select 1
        from public.service_partner_dealer_links spl
        where spl.service_partner_account_id = own.id
          and spl.dealer_account_id = da.id
          and coalesce(spl.active, true) = true
      )
    )
  )
  where c.is_external
    and not public.is_protected_internal_crm_account(own.account_number, own.company_name, own.branch_name)
    and not public.is_protected_internal_crm_account(da.account_number, da.company_name, da.branch_name)
),
external_dealer_scope as (
  select
    coalesce(array_agg(distinct id), '{}'::uuid[]) as dealer_ids,
    coalesce(array_agg(distinct lower(trim(v))) filter (where nullif(trim(v), '') is not null), '{}'::text[]) as dealer_names
  from external_dealer_rows
  cross join lateral unnest(array[company_name, branch_name, account_number]) as names(v)
),
shared_lead_scope as (
  select coalesce(array_agg(distinct cls.lead_id), '{}'::uuid[]) as lead_ids
  from public.crm_lead_shares cls
  join args a on a.caller_user_id = cls.shared_with_user_id
  where cls.revoked_at is null
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
  from public.configurations, args a
  where lead_id is not null
    and document_type = 'quote'
    and quote_number is not null
    and coalesce(lower(case_status), '') not in ('deleted', 'ordre_afgivet')
    and coalesce(lower(status), '') <> 'ordre_afgivet'
    and (
      a.is_admin
      or a.owner_user_id is null
      or assigned_seller_id = a.owner_user_id
      or created_by_user_id = a.owner_user_id
      or lower(coalesce(seller_email, '')) = a.owner_email
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
    l.id = any((select lead_ids from shared_lead_scope)) as shared,
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
  from unified_rows r, args a, external_dealer_scope eds, shared_lead_scope sls
  where
    a.is_admin
    or (
      a.is_external
      and cardinality(eds.dealer_ids) > 0
      and (
        (r.row_type = 'open' and r.linked_dealer_id = any(eds.dealer_ids))
        or lower(trim(coalesce(r.dealer, ''))) = any(eds.dealer_names)
      )
    )
    or (
      a.owner_user_id is not null
      and r.owner_user_id = a.owner_user_id
    )
    or (
      r.row_type = 'open'
      and r.id = any(sls.lead_ids)
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

drop policy if exists crm_leads_all on public.crm_leads;
drop policy if exists crm_leads_select_scoped on public.crm_leads;
create policy crm_leads_select_scoped
  on public.crm_leads
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service')
          or (
            coalesce(au.portal_role::text, au.role) = 'timan_seller'
            and (crm_leads.owner_user_id = au.id or lower(coalesce(crm_leads.owner_email, '')) = lower(au.email))
          )
          or exists (
            select 1
            from public.crm_lead_shares cls
            where cls.lead_id = crm_leads.id
              and cls.shared_with_user_id = au.id
              and cls.revoked_at is null
          )
          or exists (
            select 1
            from public.dealer_accounts own
            join public.dealer_accounts da on da.id = crm_leads.linked_dealer_id
            where coalesce(au.portal_role::text, au.role) in ('timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_customer', 'dealer_user')
              and own.account_number = au.dealer_number
              and not public.is_protected_internal_crm_account(own.account_number, own.company_name, own.branch_name)
              and not public.is_protected_internal_crm_account(da.account_number, da.company_name, da.branch_name)
              and (
                da.id = own.id
                or (
                  coalesce(au.portal_role::text, au.role) in ('timan_dealer', 'dealer_user', 'dealer_customer', 'timan_importer')
                  and da.parent_account_number = au.dealer_number
                )
                or (
                  coalesce(au.portal_role::text, au.role) = 'timan_service_partner'
                  and exists (
                    select 1
                    from public.service_partner_dealer_links spl
                    where spl.service_partner_account_id = own.id
                      and spl.dealer_account_id = da.id
                      and coalesce(spl.active, true) = true
                  )
                )
              )
          )
        )
    )
  );

drop policy if exists crm_leads_insert_scoped on public.crm_leads;
create policy crm_leads_insert_scoped
  on public.crm_leads
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service', 'timan_seller')
          or (
            crm_leads.owner_user_id = au.id
            and exists (
              select 1
              from public.dealer_accounts own
              join public.dealer_accounts da on da.id = crm_leads.linked_dealer_id
              where coalesce(au.portal_role::text, au.role) in ('timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_customer', 'dealer_user')
                and own.account_number = au.dealer_number
                and da.id = own.id
                and not public.is_protected_internal_crm_account(own.account_number, own.company_name, own.branch_name)
            )
          )
        )
    )
  );

drop policy if exists crm_leads_update_scoped on public.crm_leads;
create policy crm_leads_update_scoped
  on public.crm_leads
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service')
          or (coalesce(au.portal_role::text, au.role) = 'timan_seller' and crm_leads.owner_user_id = au.id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service')
          or (coalesce(au.portal_role::text, au.role) = 'timan_seller' and crm_leads.owner_user_id = au.id)
        )
    )
  );

drop policy if exists crm_leads_delete_scoped on public.crm_leads;
create policy crm_leads_delete_scoped
  on public.crm_leads
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service')
    )
  );

drop policy if exists crm_demo_leads_all on public.crm_demo_leads;
drop policy if exists crm_demo_leads_select_scoped on public.crm_demo_leads;
create policy crm_demo_leads_select_scoped
  on public.crm_demo_leads
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service')
          or (
            coalesce(au.portal_role::text, au.role) = 'timan_seller'
            and (crm_demo_leads.owner_user_id = au.id or lower(coalesce(crm_demo_leads.owner_email, '')) = lower(au.email))
          )
          or exists (
            select 1
            from public.dealer_accounts own
            cross join lateral unnest(array[own.company_name, own.branch_name, own.account_number]) as own_names(v)
            where coalesce(au.portal_role::text, au.role) in ('timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_customer', 'dealer_user')
              and own.account_number = au.dealer_number
              and not public.is_protected_internal_crm_account(own.account_number, own.company_name, own.branch_name)
              and lower(trim(coalesce(crm_demo_leads.dealer_company, ''))) = lower(trim(own_names.v))
          )
        )
    )
  );

drop policy if exists crm_demo_leads_insert_scoped on public.crm_demo_leads;
create policy crm_demo_leads_insert_scoped
  on public.crm_demo_leads
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service', 'timan_seller', 'timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_customer', 'dealer_user')
    )
  );

drop policy if exists crm_demo_leads_update_scoped on public.crm_demo_leads;
create policy crm_demo_leads_update_scoped
  on public.crm_demo_leads
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service')
          or (coalesce(au.portal_role::text, au.role) = 'timan_seller' and crm_demo_leads.owner_user_id = au.id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and (
          coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service')
          or (coalesce(au.portal_role::text, au.role) = 'timan_seller' and crm_demo_leads.owner_user_id = au.id)
        )
    )
  );

drop policy if exists crm_demo_leads_delete_scoped on public.crm_demo_leads;
create policy crm_demo_leads_delete_scoped
  on public.crm_demo_leads
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where coalesce(au.approved, false) = true
        and coalesce(au.is_active, false) = true
        and (
          au.auth_user_id = (select auth.uid())
          or lower(trim(au.email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
        )
        and coalesce(au.portal_role::text, au.role) in ('timan_backend', 'timan_service')
    )
  );
