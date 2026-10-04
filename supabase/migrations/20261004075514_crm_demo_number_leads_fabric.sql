-- Keep the canonical lead/demo identities separate while exposing their
-- relation to the CRM overview and the controlled analytics surface.
do $migration$
declare
  page_definition text;
  updated_definition text;
  page_signature constant text := 'public.crm_leads_page_query(boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz, text, uuid[])';
begin
  select pg_get_functiondef(page_signature::regprocedure) into page_definition;
  updated_definition := page_definition;

  if position('linked_demo_no' in updated_definition) = 0 then
    updated_definition := replace(
      updated_definition,
      'demo_source_leads as ( select distinct source_lead_id from public.crm_demo_leads where source_lead_id is not null )',
      'demo_source_leads as ( select source_lead_id, id as linked_demo_id, demo_no as linked_demo_no from public.crm_demo_leads where source_lead_id is not null )'
    );
    updated_definition := replace(
      updated_definition,
      'lq.quote_id from public.crm_leads l',
      'lq.quote_id, dsl.linked_demo_id, dsl.linked_demo_no from public.crm_leads l'
    );
    updated_definition := replace(
      updated_definition,
      'null::uuid as quote_id from public.crm_demo_leads d',
      'null::uuid as quote_id, d.id as linked_demo_id, d.demo_no as linked_demo_no from public.crm_demo_leads d'
    );
    updated_definition := replace(
      updated_definition,
      'r.machine, r.equipment, r.display_status) as search_blob',
      'r.machine, r.equipment, r.display_status, r.linked_demo_no::text, case when r.linked_demo_no is null then null else ''D-'' || r.linked_demo_no::text end) as search_blob'
    );
    updated_definition := replace(
      updated_definition,
      '''quote_id'', quote_id ))',
      '''quote_id'', quote_id, ''demo_id'', linked_demo_id, ''demo_no'', linked_demo_no ))'
    );
    updated_definition := replace(
      updated_definition,
      '''id'', demo.id, ''demo_date'', demo.demo_date',
      '''id'', demo.id, ''demo_no'', demo.demo_no, ''demo_date'', demo.demo_date'
    );

    if updated_definition = page_definition
      or position('dsl.linked_demo_no' in updated_definition) = 0
      or position('''demo_no'', linked_demo_no' in updated_definition) = 0
      or position('''D-'' || r.linked_demo_no::text' in updated_definition) = 0 then
      raise exception 'crm_leads_page_query did not match the verified Demo-number projection';
    end if;

    execute updated_definition;
  end if;
end;
$migration$;

create schema if not exists analytics_export;
revoke all on schema analytics_export from public, anon, authenticated;

create or replace view analytics_export.crm_demo_leads
with (security_invoker = false)
as
select
  demo.id as demo_id,
  demo.demo_no as demo_number,
  demo.source_lead_id,
  lead.id as lead_id,
  lead.lead_no as lead_number,
  lead.lead_reference_type,
  demo.result_status as demo_status,
  demo.demo_date,
  demo.owner_user_id as seller_id,
  demo.owner_name as seller_name,
  demo.owner_email as seller_email,
  demo.dealer_account_id,
  demo.dealer_company,
  demo.dealer_country,
  demo.customer_name,
  demo.demo_machine as machine,
  demo.completed_at,
  (demo.completed_at is not null) as is_completed
from public.crm_demo_leads demo
left join public.crm_leads lead on lead.id = demo.source_lead_id;

comment on view analytics_export.crm_demo_leads is
  'EXPLICIT_COLUMNS_ONLY Fabric staging source for canonical CRM Demo identity, Lead relation and reporting state.';

revoke all on analytics_export.crm_demo_leads from public, anon, authenticated;
grant usage on schema analytics_export to service_role;
grant select on analytics_export.crm_demo_leads to service_role;

do $grants$
begin
  if exists (select 1 from pg_roles where rolname = 'fabric_reader') then
    execute 'grant usage on schema analytics_export to fabric_reader';
    execute 'grant select on analytics_export.crm_demo_leads to fabric_reader';
  end if;
end;
$grants$;
