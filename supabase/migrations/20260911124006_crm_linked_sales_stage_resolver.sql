-- A lead's completion warning is independent of its commercial lifecycle.
-- Derive the latter from the highest visible canonical configuration event:
-- submitted order > sent quote > lead-owned activity/stage.
--
-- Both target functions have received scope-only hotfixes directly in the
-- live project. Patch their verified definitions instead of replacing them
-- from an old repository copy and accidentally rolling scope back.
do $migration$
declare
  page_signature constant text := 'public.crm_leads_page_query(boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz, text, uuid[])';
  dashboard_signature constant text := 'public.crm_dashboard_lead_kpis(uuid, text, timestamptz)';
  page_definition text;
  dashboard_definition text;
  page_status text := $sql$case coalesce( nullif(trim(l.next_activity), ''), case l.pipeline_stage when 'Lead' then 'Wants to be contacted' when 'Qualified' then 'Follow-up on leads' when 'Offer sent' then 'Offer sent to the customer' when 'Negotiation' then 'Follow-up on leads' when 'Won' then 'Closed with order' when 'Lost' then 'Closed without order' else null end ) when 'Customer requests a demonstration' then 'Demo planlagt' when 'Offer sent to the customer' then 'Tilbud sendt' when 'Closed with order' then 'Vundet' when 'Closed without order' then 'Tabt' when 'Not relevant' then 'Tabt' when 'Follow-up on leads' then 'Follow-up' else 'Lead' end as display_status$sql$;
  page_probability text := $sql$case coalesce( nullif(trim(l.next_activity), ''), case l.pipeline_stage when 'Lead' then 'Wants to be contacted' when 'Qualified' then 'Follow-up on leads' when 'Offer sent' then 'Offer sent to the customer' when 'Negotiation' then 'Follow-up on leads' when 'Won' then 'Closed with order' when 'Lost' then 'Closed without order' else null end ) when 'Wants to be contacted' then coalesce(l.probability, 15) when 'Lead sent to the dealer' then coalesce(l.probability, 10) when 'Sales material sent to the customer' then coalesce(l.probability, 30) when 'Customer requests a demonstration' then coalesce(l.probability, 50) when 'Follow-up on leads' then coalesce(l.probability, 25) when 'Offer sent to the customer' then coalesce(l.probability, 70) when 'Closed with order' then coalesce(l.probability, 100) when 'Closed without order' then coalesce(l.probability, 0) when 'Not relevant' then coalesce(l.probability, 0) when 'New lead' then coalesce(l.probability, 10) else coalesce(l.probability, 10) end as probability$sql$;
  dashboard_status text := $sql$case coalesce( nullif(trim(l.next_activity), ''), case l.pipeline_stage when 'Lead' then 'Wants to be contacted' when 'Qualified' then 'Follow-up on leads' when 'Offer sent' then 'Offer sent to the customer' when 'Negotiation' then 'Follow-up on leads' when 'Won' then 'Closed with order' when 'Lost' then 'Closed without order' else null end ) when 'Customer requests a demonstration' then 'Demo planlagt' when 'Offer sent to the customer' then 'Tilbud sendt' when 'Closed with order' then 'Vundet' when 'Closed without order' then 'Tabt' when 'Not relevant' then 'Tabt' when 'Follow-up on leads' then 'Follow-up' else 'Lead' end as display_status$sql$;
begin
  select regexp_replace(pg_get_functiondef(page_signature::regprocedure), '\s+', ' ', 'g')
    into page_definition;
  if position('linked_sales_events as (' in page_definition) = 0 then
    if position('latest_quotes as (' in page_definition) = 0
      or position(page_status in page_definition) = 0
      or position(page_probability in page_definition) = 0
      or position('left join latest_quotes lq on lq.lead_id = l.id' in page_definition) = 0 then
      raise exception 'crm_leads_page_query does not match the verified live read-model shape';
    end if;

    page_definition := replace(
      page_definition,
      '), open_rows as (',
      $sql$), linked_sales_events as (
        select
          c.lead_id,
          bool_or(c.order_sent_at is not null or c.submitted_at is not null) as has_submitted_order,
          bool_or(c.quote_sent_at is not null) as has_sent_quote
        from public.configurations c
        where c.lead_id is not null
          and coalesce(lower(c.case_status), '') <> 'deleted'
        group by c.lead_id
      ), open_rows as ($sql$
    );
    page_definition := replace(
      page_definition,
      'left join latest_quotes lq on lq.lead_id = l.id',
      'left join latest_quotes lq on lq.lead_id = l.id left join linked_sales_events lse on lse.lead_id = l.id'
    );
    page_definition := replace(
      page_definition,
      page_status,
      $sql$case when coalesce(lse.has_submitted_order, false) then 'Vundet' when coalesce(lse.has_sent_quote, false) then 'Tilbud sendt' else case coalesce( nullif(trim(l.next_activity), ''), case l.pipeline_stage when 'Lead' then 'Wants to be contacted' when 'Qualified' then 'Follow-up on leads' when 'Offer sent' then 'Offer sent to the customer' when 'Negotiation' then 'Follow-up on leads' when 'Won' then 'Closed with order' when 'Lost' then 'Closed without order' else null end ) when 'Customer requests a demonstration' then 'Demo planlagt' when 'Offer sent to the customer' then 'Tilbud sendt' when 'Closed with order' then 'Vundet' when 'Closed without order' then 'Tabt' when 'Not relevant' then 'Tabt' when 'Follow-up on leads' then 'Follow-up' else 'Lead' end end as display_status$sql$
    );
    page_definition := replace(
      page_definition,
      page_probability,
      $sql$case when coalesce(lse.has_submitted_order, false) then 100 when coalesce(lse.has_sent_quote, false) then 70 else case coalesce( nullif(trim(l.next_activity), ''), case l.pipeline_stage when 'Lead' then 'Wants to be contacted' when 'Qualified' then 'Follow-up on leads' when 'Offer sent' then 'Offer sent to the customer' when 'Negotiation' then 'Follow-up on leads' when 'Won' then 'Closed with order' when 'Lost' then 'Closed without order' else null end ) when 'Wants to be contacted' then coalesce(l.probability, 15) when 'Lead sent to the dealer' then coalesce(l.probability, 10) when 'Sales material sent to the customer' then coalesce(l.probability, 30) when 'Customer requests a demonstration' then coalesce(l.probability, 50) when 'Follow-up on leads' then coalesce(l.probability, 25) when 'Offer sent to the customer' then coalesce(l.probability, 70) when 'Closed with order' then coalesce(l.probability, 100) when 'Closed without order' then coalesce(l.probability, 0) when 'Not relevant' then coalesce(l.probability, 0) when 'New lead' then coalesce(l.probability, 10) else coalesce(l.probability, 10) end end as probability$sql$
    );
    execute page_definition;
  end if;

  select regexp_replace(pg_get_functiondef(dashboard_signature::regprocedure), '\s+', ' ', 'g')
    into dashboard_definition;
  if position('linked_sales_events as (' in dashboard_definition) = 0 then
    if position('with bounds as (' in dashboard_definition) = 0
      or position(dashboard_status in dashboard_definition) = 0
      or position('from public.crm_leads l where' in dashboard_definition) = 0 then
      raise exception 'crm_dashboard_lead_kpis does not match the verified live read-model shape';
    end if;

    dashboard_definition := replace(
      dashboard_definition,
      '), lead_rows as (',
      $sql$), linked_sales_events as (
        select
          c.lead_id,
          bool_or(c.order_sent_at is not null or c.submitted_at is not null) as has_submitted_order,
          bool_or(c.quote_sent_at is not null) as has_sent_quote
        from public.configurations c
        where c.lead_id is not null
          and coalesce(lower(c.case_status), '') <> 'deleted'
        group by c.lead_id
      ), lead_rows as ($sql$
    );
    dashboard_definition := replace(
      dashboard_definition,
      'from public.crm_leads l where',
      'from public.crm_leads l left join linked_sales_events lse on lse.lead_id = l.id where'
    );
    dashboard_definition := replace(
      dashboard_definition,
      dashboard_status,
      $sql$case when coalesce(lse.has_submitted_order, false) then 'Vundet' when coalesce(lse.has_sent_quote, false) then 'Tilbud sendt' else case coalesce( nullif(trim(l.next_activity), ''), case l.pipeline_stage when 'Lead' then 'Wants to be contacted' when 'Qualified' then 'Follow-up on leads' when 'Offer sent' then 'Offer sent to the customer' when 'Negotiation' then 'Follow-up on leads' when 'Won' then 'Closed with order' when 'Lost' then 'Closed without order' else null end ) when 'Customer requests a demonstration' then 'Demo planlagt' when 'Offer sent to the customer' then 'Tilbud sendt' when 'Closed with order' then 'Vundet' when 'Closed without order' then 'Tabt' when 'Not relevant' then 'Tabt' when 'Follow-up on leads' then 'Follow-up' else 'Lead' end end as display_status$sql$
    );
    execute dashboard_definition;
  end if;
end;
$migration$;


