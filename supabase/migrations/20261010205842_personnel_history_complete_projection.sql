-- Retain documented lifecycle facts even when more than 500 user/contact events exist.
-- Same Backend-only gate and minimal projection; no data or permissions are changed.
CREATE OR REPLACE FUNCTION public.backend_personnel_history()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or public.is_backend() is not true then raise exception 'Backend history access required' using errcode='42501'; end if;
  return jsonb_build_object(
    'users',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',coalesce(nullif(u.display_name,''),u.full_name),
      'company',coalesce(d.company_name,u.company),'role',u.portal_role,'is_active',u.is_active,'approved',u.approved,'status',u.status,
      'created_at',u.created_at,'last_login_at',u.last_login) order by u.full_name) from public.app_users u left join public.dealer_accounts d on d.account_number=u.dealer_number),'[]'::jsonb),
    'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'company',d.company_name,'account',d.account_number,
      'area',c.contact_area,'removed_at',c.removed_at,'removed_by',actor.full_name) order by c.removed_at desc)
      from public.dealer_contacts c join public.dealer_accounts d on d.id=c.dealer_account_id left join public.app_users actor on actor.id=c.removed_by
      where c.removed_at is not null),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(e order by e->>'at' desc) from (
      select jsonb_build_object('id',a.id,'at',a.created_at,'actor',coalesce(nullif(actor.display_name,''),actor.full_name,a.actor_name),
        'record_id',a.record_id,'record_type',a.record_type,
        'label',coalesce(a.old_value->>'full_name',a.new_value->>'full_name',a.old_value->>'name',a.new_value->>'name'),
        'action',a.action,'server_recorded',a.recorded_by_server,
        'old',coalesce((select jsonb_object_agg(key,value) from jsonb_each(case when jsonb_typeof(a.old_value)='object' then a.old_value else '{}'::jsonb end)
          where key in ('full_name','company','portal_role','role','status','approved','is_active','archived_at','name','contact_area','dealer_account_id','removed_at')),'{}'::jsonb),
        'new',coalesce((select jsonb_object_agg(key,value) from jsonb_each(case when jsonb_typeof(a.new_value)='object' then a.new_value else '{}'::jsonb end)
          where key in ('full_name','company','portal_role','role','status','approved','is_active','archived_at','removed_at')),'{}'::jsonb)) e
      from public.audit_log a left join public.app_users actor on actor.id=a.actor_user_id
      where a.status='success' and a.record_type in ('app_users','dealer_contact') order by a.created_at desc
    ) events),'[]'::jsonb));
end $function$
