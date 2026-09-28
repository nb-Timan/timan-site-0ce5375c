-- One-time normalization of imported G-lead closure state.
--
-- The CRM already treats these exact legacy next-activity values as closed at
-- read time. This migration makes the stored status, stage and probability
-- agree with that canonical interpretation. Existing audit triggers record the
-- changed fields; no parallel history or note rows are created here.
do $migration$
declare
  v_safe_before integer;
  v_ambiguous integer;
  v_updated integer;
  v_remaining integer;
begin
  select count(*)
    into v_ambiguous
  from public.crm_leads lead
  where lead.lead_no >= 5000
    and trim(lead.next_activity) in (
      'Closed without order',
      'Lukket uden ordre',
      'Closed with order',
      'Lukket med ordre'
    )
    and (
      (trim(lead.next_activity) in ('Closed without order', 'Lukket uden ordre') and lead.pipeline_stage = 'Won')
      or
      (trim(lead.next_activity) in ('Closed with order', 'Lukket med ordre') and lead.pipeline_stage = 'Lost')
    );

  select count(*)
    into v_safe_before
  from public.crm_leads lead
  where lead.lead_no >= 5000
    and trim(lead.next_activity) in (
      'Closed without order',
      'Lukket uden ordre',
      'Closed with order',
      'Lukket med ordre'
    )
    and not (
      (trim(lead.next_activity) in ('Closed without order', 'Lukket uden ordre') and lead.pipeline_stage = 'Won')
      or
      (trim(lead.next_activity) in ('Closed with order', 'Lukket med ordre') and lead.pipeline_stage = 'Lost')
    )
    and (
      lead.status is distinct from 'closed'
      or lead.pipeline_stage is distinct from case
        when trim(lead.next_activity) in ('Closed with order', 'Lukket med ordre') then 'Won'
        else 'Lost'
      end
      or lead.probability is distinct from case
        when trim(lead.next_activity) in ('Closed with order', 'Lukket med ordre') then 100
        else 0
      end
      or lead.next_activity is distinct from case
        when trim(lead.next_activity) in ('Closed with order', 'Lukket med ordre') then 'Closed with order'
        else 'Closed without order'
      end
    );

  update public.crm_leads lead
  set
    next_activity = case
      when trim(lead.next_activity) in ('Closed with order', 'Lukket med ordre') then 'Closed with order'
      else 'Closed without order'
    end,
    pipeline_stage = case
      when trim(lead.next_activity) in ('Closed with order', 'Lukket med ordre') then 'Won'
      else 'Lost'
    end,
    probability = case
      when trim(lead.next_activity) in ('Closed with order', 'Lukket med ordre') then 100
      else 0
    end,
    status = 'closed'
  where lead.lead_no >= 5000
    and trim(lead.next_activity) in (
      'Closed without order',
      'Lukket uden ordre',
      'Closed with order',
      'Lukket med ordre'
    )
    and not (
      (trim(lead.next_activity) in ('Closed without order', 'Lukket uden ordre') and lead.pipeline_stage = 'Won')
      or
      (trim(lead.next_activity) in ('Closed with order', 'Lukket med ordre') and lead.pipeline_stage = 'Lost')
    )
    and (
      lead.status is distinct from 'closed'
      or lead.pipeline_stage is distinct from case
        when trim(lead.next_activity) in ('Closed with order', 'Lukket med ordre') then 'Won'
        else 'Lost'
      end
      or lead.probability is distinct from case
        when trim(lead.next_activity) in ('Closed with order', 'Lukket med ordre') then 100
        else 0
      end
      or lead.next_activity is distinct from case
        when trim(lead.next_activity) in ('Closed with order', 'Lukket med ordre') then 'Closed with order'
        else 'Closed without order'
      end
    );

  get diagnostics v_updated = row_count;

  select count(*)
    into v_remaining
  from public.crm_leads lead
  where lead.lead_no >= 5000
    and trim(lead.next_activity) in (
      'Closed without order',
      'Lukket uden ordre',
      'Closed with order',
      'Lukket med ordre'
    )
    and not (
      (trim(lead.next_activity) in ('Closed without order', 'Lukket uden ordre') and lead.pipeline_stage = 'Won')
      or
      (trim(lead.next_activity) in ('Closed with order', 'Lukket med ordre') and lead.pipeline_stage = 'Lost')
    )
    and (
      lead.status is distinct from 'closed'
      or lead.pipeline_stage is distinct from case
        when trim(lead.next_activity) in ('Closed with order', 'Lukket med ordre') then 'Won'
        else 'Lost'
      end
      or lead.probability is distinct from case
        when trim(lead.next_activity) in ('Closed with order', 'Lukket med ordre') then 100
        else 0
      end
      or lead.next_activity is distinct from case
        when trim(lead.next_activity) in ('Closed with order', 'Lukket med ordre') then 'Closed with order'
        else 'Closed without order'
      end
    );

  if v_updated <> v_safe_before then
    raise exception 'Legacy G-lead normalization changed % rows; expected %', v_updated, v_safe_before;
  end if;

  if v_remaining <> 0 then
    raise exception 'Legacy G-lead normalization left % safe rows unnormalized', v_remaining;
  end if;

  raise notice 'Legacy G-lead normalization: updated %, ambiguous/skipped %', v_updated, v_ambiguous;
end;
$migration$;
