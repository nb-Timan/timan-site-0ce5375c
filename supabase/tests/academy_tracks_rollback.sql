-- Synthetic identities only. The transaction rolls back every QA row and audit.
begin;
create temporary table academy_track_qa_ids as select gen_random_uuid() as uid, gen_random_uuid() as aid,
  gen_random_uuid() as other_uid, gen_random_uuid() as cycle_id, gen_random_uuid() as other_cycle;
grant select on academy_track_qa_ids to authenticated;
insert into public.app_users(id,auth_user_id,email,role,portal_role,approved,is_active,allowed_modules,permissions)
  select uid,aid,'academy-track-qa-' || uid || '@example.invalid','timan_saelger','timan_seller',true,true,
    array['academy'],'{"academy_track_sales":false,"academy_track_service":true}' from academy_track_qa_ids;
insert into public.app_users(id,email,approved,is_active)
  select other_uid,'academy-track-qa-' || other_uid || '@example.invalid',true,true from academy_track_qa_ids;
insert into public.academy_cycles(id,user_id,cycle_number) select cycle_id,uid,1 from academy_track_qa_ids;
insert into public.academy_cycles(id,user_id,cycle_number) select other_cycle,other_uid,1 from academy_track_qa_ids;
select set_config('request.jwt.claims',jsonb_build_object('sub',aid,'role','authenticated')::text,true),
  set_config('request.jwt.claim.sub',aid::text,true), set_config('request.jwt.claim.role','authenticated',true)
  from academy_track_qa_ids;
set local role authenticated;
do $qa$
declare
  qa record;
  blocked boolean;
  result jsonb;
  basic text[] := array['partnerdata.part_1_profile','partnerdata.part_2_relations','portal.basics_5','portal.partner_map'];
  item text;
begin
  select * into strict qa from academy_track_qa_ids;
  if public.academy_current_user_id() <> qa.uid then raise exception 'QA auth identity mismatch'; end if;
  if cardinality(public.academy_assigned_case_ids('{}', '{"academy_track_sales":true}')) <> 0
    or cardinality(public.academy_assigned_case_ids(array['academy'], '{}')) <> 8
    or cardinality(public.academy_assigned_case_ids(array['academy'], '{"academy_track_sales":null}')) <> 8
    or public.academy_assigned_case_ids(array['academy'], '{"academy_track_sales":false,"academy_track_service":true}') <> basic
    or cardinality(public.academy_assigned_case_ids(array['academy'], '{"academy_track_sales":true,"academy_track_service":true}')) <> 8 then
    raise exception 'Track/default/denominator mismatch';
  end if;
  if has_function_privilege('anon', 'public.record_academy_cycle_completion(uuid,text)', 'execute') then
    raise exception 'Anonymous completion access';
  end if;
  blocked := false;
  begin perform public.record_academy_cycle_completion(qa.cycle_id,'sales.case_1_rc1000');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Unassigned Sales completion accepted'; end if;

  blocked := false;
  begin perform public.record_academy_cycle_completion(qa.other_cycle,basic[1]);
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Cross-user completion accepted'; end if;
  if exists(select 1 from public.academy_cycles where id=qa.other_cycle) then raise exception 'Cross-user cycle visible'; end if;

  blocked := false;
  begin perform public.admin_get_academy_cycle_history(qa.other_uid);
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Non-Backend history access accepted'; end if;

  blocked := false;
  begin insert into public.academy_cycle_completions(cycle_id,case_id) values(qa.cycle_id,'sales.case_1_rc1000');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Direct completion write accepted'; end if;

  blocked := false;
  begin update public.app_users set permissions='{"academy_track_sales":true}' where id=qa.uid;
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Self-granted track access'; end if;

  perform public.record_academy_cycle_completion(qa.cycle_id,basic[1]);
  perform public.record_academy_cycle_completion(qa.cycle_id,basic[1]);
  if (select count(*) from public.academy_cycle_completions c where c.cycle_id=qa.cycle_id) <> 1 then
    raise exception 'Duplicate completion';
  end if;
  foreach item in array basic[2:4] loop
    result := public.record_academy_cycle_completion(qa.cycle_id,item);
  end loop;
  if result->>'completion_count' <> '4' or result->'cycle'->>'status' <> 'completed'
    or result->'cycle'->'completed_curriculum' <> to_jsonb(basic) then
    raise exception 'Basic-only completion did not freeze the assigned four cases';
  end if;
  if (select count(*) from public.academy_cycle_awards a where a.cycle_id=qa.cycle_id and award='gold') <> 1 then
    raise exception 'Assigned curriculum gold award missing';
  end if;

end;
$qa$;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
update public.app_users set allowed_modules='{}' where id=(select uid from academy_track_qa_ids);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $qa$
declare qa record; blocked boolean;
begin
  select * into strict qa from academy_track_qa_ids;
  blocked := false;
  begin perform public.record_academy_cycle_completion(qa.cycle_id,'partnerdata.part_1_profile');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Academy OFF accepted completion'; end if;
end;
$qa$;
rollback;
select 'PASS: tracks, compatibility, assigned completion, duplicate prevention, area OFF, ownership, RLS and self-escalation; all QA writes rolled back' as result;
