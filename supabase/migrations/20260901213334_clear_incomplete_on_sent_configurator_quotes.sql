-- Repair CRM leads that were created from the configurator and later got a
-- real sent quote/order event, but kept the draft-only incomplete marker.
update public.crm_leads l
set
  incomplete_from_configurator = false,
  updated_at = now()
where coalesce(l.incomplete_from_configurator, false) = true
  and exists (
    select 1
    from public.configurations c
    where c.lead_id = l.id
      and coalesce(c.case_status, '') <> 'deleted'
      and (
        c.quote_sent_at is not null
        or c.order_sent_at is not null
        or c.submitted_at is not null
        or lower(coalesce(c.case_status, '')) = 'ordre_afgivet'
        or lower(coalesce(c.status, '')) = 'ordre_afgivet'
      )
  );
