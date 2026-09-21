-- Integration acceptance against the deployed functions. All QA writes roll back.
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub', auth_user_id, 'email', email, 'role', 'authenticated')::text, true)
from public.app_users where initials = 'AKR' and approved and is_active;
set local role authenticated;
do $qa$
declare
  actor public.app_users%rowtype;
  l uuid; d uuid; c uuid; r jsonb; page jsonb; blocked boolean; affected integer;
begin
  select * into strict actor from app_users where auth_user_id = auth.uid();
  insert into crm_leads(title, owner_user_id, owner_name, owner_email, next_activity,
    pipeline_stage, demo_has_run, next_followup_date, expected_close_date, created_by_user_id)
  values ('TEST rollback canonical demo', actor.id, actor.initials, actor.email,
    'Customer requests a demonstration', 'Qualified', 'no', '2026-10-10', '2026-11-30', actor.id) returning id into l;
  if not exists(select 1 from crm_leads where id=l and probability=40 and not demo_registration_pending) then raise exception 'requested stage'; end if;

  blocked := false;
  begin update crm_leads set next_activity='Demonstration scheduled' where id=l;
  exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'forged scheduled state accepted'; end if;
  perform start_crm_demo_registration(l);
  perform start_crm_demo_registration(l);
  if (select count(*) from crm_activities where lead_id=l and activity_type='demo_registration_started')<>1 then raise exception 'duplicate started history'; end if;
  page:=crm_leads_page_query(p_owner_user_id=>actor.id, p_search=>'TEST rollback canonical demo');
  if not exists(select 1 from jsonb_array_elements(page->'rows') x where x->>'id'=l::text and (x->>'demo_registration_pending')::boolean) then raise exception 'warning projection'; end if;

  blocked:=false;
  begin perform create_crm_demo_lifecycle(l,jsonb_build_object('title','TEST missing date'));
  exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'missing date accepted'; end if;
  r:=create_crm_demo_lifecycle(l,jsonb_build_object('title','TEST canonical demo','demo_date','2026-10-15','followup_date','2027-01-01','demo_machine','RC-751'));
  d:=(r->>'demo_id')::uuid;
  if not exists(select 1 from crm_leads where id=l and next_activity='Demonstration scheduled' and probability=50
    and not demo_registration_pending and next_followup_date='2026-10-10' and expected_close_date='2026-11-30') then raise exception 'scheduled/date independence'; end if;
  select id into strict c from crm_calendar_activities where demo_lead_id=d and seller_initials=actor.initials and status='planned';
  blocked:=false;
  begin perform create_crm_demo_lifecycle(l,jsonb_build_object('title','TEST duplicate','demo_date','2026-10-15'));
  exception when unique_violation then blocked:=true; end;
  if not blocked then raise exception 'duplicate accepted'; end if;
  update crm_demo_leads set demo_date='2026-10-17' where id=d;
  if not exists(select 1 from crm_leads where id=l and next_followup_date='2026-10-10' and expected_close_date='2026-11-30') then raise exception 'date change overwrote lead dates'; end if;
  if (select id from crm_calendar_activities where demo_lead_id=d)<>c then raise exception 'calendar duplicate'; end if;
  if (select count(*) from crm_activities where lead_id=l and activity_type='demo_date_changed')<>1 then raise exception 'date history'; end if;
  update crm_demo_leads set result_status='canceled' where id=d;
  if not exists(select 1 from crm_leads where id=l and probability=40 and demo_registration_pending) then raise exception 'cancelled stage'; end if;
  update crm_demo_leads set result_status='Warm lead' where id=d;
  update crm_leads set demo_has_run='yes' where id=l;
  if (select count(*) from crm_activities where lead_id=l and activity_type='demo_held')<>1 then raise exception 'completion history'; end if;
  update crm_leads set demo_has_run='no' where id=l;

  delete from crm_demo_leads where id=d;
  get diagnostics affected = row_count;
  if affected<>0 then raise exception 'seller acquired delete permission'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',auth_user_id,'email',email,'role','authenticated')::text,true)
  from app_users where initials='EM' and approved and is_active;
  blocked:=false;
  begin perform start_crm_demo_registration(l); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'cross-seller start allowed'; end if;
  blocked:=false;
  begin perform create_crm_demo_lifecycle(l,jsonb_build_object('title','TEST cross seller','demo_date','2026-10-15'));
  exception when others then blocked:=position('scope' in sqlerrm)>0; end;
  if not blocked then raise exception 'cross-seller create allowed'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub',auth_user_id,'email',email,'role','authenticated')::text,true)
  from app_users where initials='NB' and approved and is_active;
  delete from crm_demo_leads where id=d;
  get diagnostics affected = row_count;
  if affected<>1 then raise exception 'Backend cleanup failed'; end if;
  if not exists(select 1 from crm_calendar_activities where id=c and status='canceled') then raise exception 'delete calendar cancellation'; end if;
  if not exists(select 1 from crm_leads where id=l and probability=40 and demo_registration_pending) then raise exception 'deleted stage'; end if;

  r:=create_crm_demo_lifecycle(l,jsonb_build_object('title','TEST explicit followup','demo_date','2026-10-15','update_followup',true,'followup_date','2026-10-12'));
  if not exists(select 1 from crm_leads where id=l and next_followup_date='2026-10-12' and expected_close_date='2026-11-30') then raise exception 'explicit followup'; end if;
  r:=create_crm_demo_lifecycle(null,jsonb_build_object('title','TEST new lead','owner_user_id',actor.id,'demo_date','2026-10-15','followup_date','2026-10-10'));
  if (select count(*) from crm_demo_leads where source_lead_id=(r->>'lead_id')::uuid)<>1 then raise exception 'new lead/demo cardinality'; end if;
end;
$qa$;
select 'PASS: requested/scheduled, mandatory date, independent dates, explicit follow-up, history, unique demo/calendar, cancellation, delete permissions, cross-seller isolation, list warning, new lead' as result;
rollback;
