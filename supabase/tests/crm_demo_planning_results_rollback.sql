-- QA only: every write is rolled back, including the linked lead, demo and calendar.
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub',auth_user_id,'email',email,'role','authenticated')::text,true)
from public.app_users where initials='AKR' and approved and is_active;
set local role authenticated;
do $qa$
declare
  actor public.app_users%rowtype; dealer public.dealer_accounts%rowtype;
  l uuid; d uuid; c uuid; other_seller uuid; r jsonb; payload jsonb; page jsonb; blocked boolean;
  outcome jsonb := jsonb_build_object('interest_level',4,'wants_offer','yes','result_status','Warm lead',
    'probability',60,'notes_after_demo','TEST result','competitors_present',null,
    'update_followup',true,'followup_date','2026-11-12');
begin
  select * into strict actor from app_users where auth_user_id=auth.uid();
  select * into strict dealer from dealer_accounts where deleted_at is null
    and (assigned_seller_id=actor.id or lower(assigned_seller_email)=lower(actor.email)
      or assigned_seller_initials=actor.initials) order by account_number limit 1;
  insert into crm_leads(title,owner_user_id,owner_name,owner_email,next_activity,pipeline_stage,
    demo_has_run,next_followup_date,expected_close_date,created_by_user_id,trade_fair)
  values('TEST demo phases rollback',actor.id,actor.initials,actor.email,'Customer requests a demonstration',
    'Qualified','no','2026-10-10','2026-12-31',actor.id,'Messe / exhibition') returning id into l;
  update crm_leads set incomplete_from_configurator=true where id=l;
  payload:=jsonb_build_object('title','TEST demo phases rollback','owner_user_id',actor.id,'dealer_account_id',dealer.id,
    'demo_date',current_date+7,'customer_name','TEST Customer','machine_category',jsonb_build_array('Timan machine'),
    'machine_interest',jsonb_build_array('RC-751'),'demo_machine','RC-751','demo_equipment','[]'::jsonb,
    'interest_level',3,'wants_offer','yes','estimated_value',999,'result_status','Warm lead','update_followup',true,'followup_date','2027-01-01');
  r:=save_crm_demo_registration(null,l,payload,actor.id); d:=(r->>'demo_id')::uuid;
  if (r->>'lead_id')::uuid<>l then raise exception 'Existing lead duplicated'; end if;
  if not exists(select 1 from crm_demo_leads where id=d and interest_level is null and wants_offer is null
    and estimated_value is null and probability is null and result_status is null and completed_at is null) then raise exception 'False planning defaults'; end if;
  if not exists(select 1 from crm_leads where id=l and linked_dealer_id=dealer.id and next_followup_date='2026-10-10'
    and expected_close_date='2026-12-31' and trade_fair='Messe / exhibition' and probability=50 and incomplete_from_configurator and not demo_registration_pending) then raise exception 'Lead date/source/assignment/completeness changed incorrectly'; end if;
  select id into strict c from crm_calendar_activities where demo_lead_id=d and status='planned';
  page:=crm_leads_page_query(p_owner_user_id=>actor.id,p_search=>'TEST demo phases rollback');
  if not exists(select 1 from jsonb_array_elements(page->'rows') x where x->>'id'=l::text and x->'demo_registration'->>'id'=d::text) then raise exception 'List demo projection missing'; end if;
  blocked:=false;
  begin perform save_crm_demo_result(d,outcome,actor.id); exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'Future demo marked completed'; end if;
  blocked:=false;
  begin perform save_crm_demo_registration(null,l,payload,actor.id); exception when unique_violation then blocked:=true; end;
  if not blocked then raise exception 'Duplicate demo accepted'; end if;
  payload:=payload||jsonb_build_object('demo_date',current_date-1);
  perform save_crm_demo_registration(d,l,payload,actor.id);
  if (select id from crm_calendar_activities where demo_lead_id=d)<>c then raise exception 'Calendar duplicated'; end if;
  if exists(select 1 from crm_demo_leads where id=d and completed_at is not null) then raise exception 'Past date auto-completed'; end if;
  perform save_crm_lead_note_followup(gen_random_uuid(),l,'TEST independent followup',
    '2026-11-01','Demonstration scheduled',false,'TEST demo phases rollback');
  if not exists(select 1 from crm_leads where id=l and next_followup_date='2026-11-01') then raise exception 'Scheduled demo followup rejected'; end if;
  if (select demo_date from crm_demo_leads where id=d)<>current_date-1 then raise exception 'Followup changed demo date'; end if;
  blocked:=false;
  begin perform save_crm_demo_result(d,'{}'::jsonb,actor.id); exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'Blank results accepted'; end if;
  perform save_crm_demo_result(d,outcome,actor.id);
  perform save_crm_demo_result(d,outcome,actor.id);
  if not exists(select 1 from crm_demo_leads where id=d and completed_at is not null and completed_by=actor.id and interest_level=4) then raise exception 'Result not saved'; end if;
  if not exists(select 1 from crm_leads where id=l and demo_has_run='yes' and next_followup_date='2026-11-12'
    and expected_close_date='2026-12-31') then raise exception 'Completion/followup mismatch'; end if;
  if (select count(*) from crm_activities where lead_id=l and activity_type='demo_held')<>1 then raise exception 'Duplicate completion history'; end if;
  if (select count(*) from crm_calendar_activities where demo_lead_id=d)<>1 or not exists(select 1 from crm_calendar_activities where id=c and status='completed') then raise exception 'Calendar completion mismatch'; end if;
  r:=save_crm_demo_registration(null,null,payload||jsonb_build_object('title','TEST standalone rollback'),actor.id);
  if (select count(*) from crm_demo_leads where source_lead_id=(r->>'lead_id')::uuid)<>1 then raise exception 'Standalone cardinality'; end if;
  blocked:=false;
  begin perform save_crm_demo_registration(null,null,payload||(select jsonb_build_object('dealer_account_id',id) from dealer_accounts
    where deleted_at is null and assigned_seller_id is distinct from actor.id and coalesce(lower(assigned_seller_email),'')<>lower(actor.email)
      and coalesce(assigned_seller_initials,'') not like '%'||actor.initials||'%' and parent_account_number is null limit 1),actor.id);
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Cross-dealer accepted'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',auth_user_id,'email',email,'role','authenticated')::text,true)
    from app_users where initials='EM' and approved and is_active;
  blocked:=false;
  begin perform save_crm_demo_result(d,outcome,null); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Cross-seller results accepted'; end if;
  blocked:=false;
  begin perform save_crm_demo_result(d,outcome,actor.id); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Seller forged View-as accepted'; end if;
  select id into strict other_seller from app_users where initials='EM' and approved and is_active;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',auth_user_id,'email',email,'role','authenticated')::text,true)
    from app_users where initials='NB' and portal_role='timan_backend' and approved and is_active;
  blocked:=false;
  begin perform save_crm_demo_result(d,outcome,other_seller); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Backend View-as leaked global scope'; end if;
  perform save_crm_demo_result(d,outcome,actor.id);
  if (select count(*) from crm_activities where lead_id=l and activity_type='demo_held')<>1 then raise exception 'View-as duplicated history'; end if;
end;
$qa$;
select 'PASS: planning/results, existing/standalone, one demo/calendar/history, dates/provenance, seller/dealer/forged View-as isolation' as result;
rollback;
