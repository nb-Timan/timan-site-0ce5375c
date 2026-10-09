-- Run against the migrated Timan database with an administrative test session.
-- Only freshly generated TEST rows are touched; the entire fixture rolls back.
begin;
create temporary table deletion_test_results (check_name text, result text) on commit drop;
do $$
#variable_conflict use_variable
declare
  backend_uid uuid;
  seller_uid uuid;
  lead_id uuid := gen_random_uuid();
  quote_id uuid := gen_random_uuid();
  order_id uuid := gen_random_uuid();
  kept_order_id uuid := gen_random_uuid();
  note_id uuid := gen_random_uuid();
  demo_id uuid := gen_random_uuid();
  mail_id uuid := gen_random_uuid();
  audit_id uuid := gen_random_uuid();
  result jsonb;
  before_lead jsonb;
  before_order jsonb;
  before_quote jsonb;
  stage text;
  temporary_lead_id uuid;
begin
  select u.id into strict backend_uid from auth.users u where lower(u.email) = 'nb@timan.dk';
  select u.id into strict seller_uid from auth.users u where lower(u.email) = 'akr@timan.dk';

  set local role authenticated;
  begin
    perform public.delete_crm_sales_document(order_id, backend_uid);
    raise exception 'Authenticated direct document delete was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.delete_crm_lead_permanently(lead_id, backend_uid);
    raise exception 'Authenticated direct lead delete was allowed';
  exception when insufficient_privilege then null;
  end;
  reset role;
  insert into deletion_test_results values ('Direct authenticated RPC requests', 'BLOCKED');

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  begin
    perform public.delete_crm_sales_document(order_id, seller_uid);
    raise exception 'Seller actor was accepted by server RPC';
  exception when insufficient_privilege then null;
  end;
  insert into deletion_test_results values ('Server rejects non-Backend actor', 'PASS');

  perform public.prepare_backend_crm_deletion_actor(backend_uid);
  insert into public.crm_leads(id, lead_no, title, status) values (lead_id, 20922001, 'TEST permanent deletion transaction', 'open');
  insert into public.configurations(id, title, lead_id, document_type, case_type, case_status, quote_number, state_json)
  values (quote_id, 'TEST independent quote', lead_id, 'quote', 'quote', 'draft', 'T-QA-DELETE-' || quote_id::text, '{}');
  insert into public.configurations(id, title, lead_id, document_type, case_type, case_status, state_json, source_quote_id, source_quote_number)
  values (order_id, 'TEST submitted deletion', lead_id, 'order', 'order', 'draft', '{}', quote_id, 'T-QA-DELETE-' || quote_id::text);
  insert into public.configuration_items(configuration_id) values (order_id);
  update public.configurations set submitted_at = now(), order_number = 'O-QA-DELETE-' || order_id::text, case_status = 'submitted' where id = order_id;
  select to_jsonb(l) into before_lead from public.crm_leads l where id = lead_id;
  select to_jsonb(q) into before_quote from public.configurations q where id = quote_id;

  begin
    update public.configurations set title = 'UNAUTHORIZED CHANGE' where id = order_id;
    raise exception 'Submitted order update was allowed outside correction path';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.configurations where id = order_id;
    raise exception 'Submitted order direct delete was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.configuration_items where configuration_id = order_id;
    raise exception 'Submitted item direct delete was allowed';
  exception when insufficient_privilege then null;
  end;
  insert into deletion_test_results values ('Submitted order and items remain read-only', 'PASS');

  insert into public.crm_activities(configuration_id, activity_type, title) values (order_id, 'order_created', 'TEST document activity');
  insert into public.mail_audit_events(id, category, source_module, source_action, status)
  values (mail_id, 'system', 'qa', 'deletion_test_no_email_sent', 'queued');
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  result := public.delete_crm_sales_document(order_id, backend_uid);
  if exists(select 1 from public.configurations where id = order_id)
    or exists(select 1 from public.configuration_items where configuration_id = order_id)
    or exists(select 1 from public.crm_activities where configuration_id = order_id) then
    raise exception 'Document rows survived deletion';
  end if;
  if (select to_jsonb(l) from public.crm_leads l where id = lead_id) is distinct from before_lead
    or (select to_jsonb(q) from public.configurations q where id = quote_id) is distinct from before_quote then
    raise exception 'Deleting order changed originating lead or quote';
  end if;
  if not exists(select 1 from public.audit_log where record_id = order_id::text and action = 'delete' and actor_email = 'nb@timan.dk')
    or not exists(select 1 from public.mail_audit_events where id = mail_id) then
    raise exception 'Audit or mail evidence missing';
  end if;
  insert into deletion_test_results values ('Submitted order permanent delete, lead/quote untouched, audit retained', 'PASS');

  insert into public.configurations(id, title, lead_id, document_type, case_type, case_status, state_json, source_quote_id, source_quote_number, submitted_at, order_number)
  values (kept_order_id, 'TEST independent order', lead_id, 'order', 'order', 'submitted', '{"frozen":"unchanged"}', quote_id, 'T-QA-DELETE-' || quote_id::text, now(), 'O-QA-KEEP-' || kept_order_id::text);
  select to_jsonb(c) - 'lead_id' - 'updated_at' into before_order from public.configurations c where id = kept_order_id;
  insert into public.crm_activities(id, lead_id, activity_type, title, description) values (note_id, lead_id, 'comment', 'TEST note', 'TEST lead-owned history');
  insert into public.crm_calendar_activities(title, start_datetime, lead_id, lead_activity_id) values ('TEST follow-up', now(), lead_id, note_id);
  insert into public.crm_demo_leads(id, demo_no, title, source_lead_id, demo_date) values (demo_id, 20922001, 'TEST linked demo', lead_id, current_date);
  insert into public.crm_lead_share_audit_log(id, lead_id, action) values (audit_id, lead_id, 'shared');
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  result := public.delete_crm_lead_permanently(lead_id, backend_uid);
  if exists(select 1 from public.crm_leads where id = lead_id)
    or exists(select 1 from public.crm_demo_leads where id = demo_id)
    or exists(select 1 from public.crm_activities where id = note_id)
    or exists(select 1 from public.crm_calendar_activities c where c.lead_id = lead_id or c.demo_lead_id = demo_id)
    or exists(select 1 from public.configurations where configurations.lead_id = lead_id) then
    raise exception 'Lead-owned records or references survived deletion';
  end if;
  if (select to_jsonb(c) - 'lead_id' - 'updated_at' from public.configurations c where id = kept_order_id) is distinct from before_order
    or not exists(select 1 from public.configurations where id = quote_id and configurations.lead_id is null) then
    raise exception 'Independent quote/order not preserved or quote trigger recreated lead';
  end if;
  if not exists(select 1 from public.crm_lead_share_audit_log where id = audit_id)
    or not exists(select 1 from public.mail_audit_events where id = mail_id)
    or not exists(select 1 from public.audit_log where record_id = lead_id::text and action = 'delete') then
    raise exception 'Lead audit evidence lost';
  end if;
  insert into deletion_test_results values ('Lead deletion cleans dependencies and preserves independent documents/audit', 'PASS');

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.delete_crm_sales_document(quote_id, backend_uid);
  if not exists(select 1 from public.configurations where id = kept_order_id and source_quote_id is null and state_json->>'frozen' = 'unchanged') then
    raise exception 'Quote deletion did not safely detach independent submitted order';
  end if;
  insert into deletion_test_results values ('Quote deletion preserves independent submitted order', 'PASS');

  foreach stage in array array['Lead','Won','Lost'] loop
    insert into public.crm_leads(lead_no, title, pipeline_stage, status)
    values (20922002, 'TEST status deletion', stage, case when stage='Lead' then 'open' else 'closed' end) returning id into temporary_lead_id;
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    perform public.delete_crm_lead_permanently(temporary_lead_id, backend_uid);
    if exists(select 1 from public.crm_leads where id = temporary_lead_id) then raise exception 'Lead status deletion failed'; end if;
  end loop;
  insert into deletion_test_results values ('Open/won/lost lead status deletion', 'PASS');
end;
$$;
select * from deletion_test_results;
rollback;
