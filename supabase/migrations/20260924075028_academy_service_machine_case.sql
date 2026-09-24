-- Only Academy curriculum metadata changes. Machine/service training data is local.
-- Completed cycles retain their frozen completed_curriculum and are not reopened.
create or replace function public.academy_assigned_case_ids(p_modules text[], p_permissions jsonb)
returns text[] language sql immutable security invoker set search_path = public
as $$
  select case when coalesce('academy' = any(p_modules), false) then
    array['partnerdata.part_1_profile', 'partnerdata.part_2_relations', 'portal.basics_5', 'portal.partner_map']::text[]
    || case when coalesce(nullif(p_permissions->'academy_track_sales', 'null'::jsonb), 'true'::jsonb) = 'true'::jsonb then
      array['sales.case_1_rc1000', 'sales.case_2_video_3330', 'crm.part_1', 'crm.part_2']::text[]
      else '{}'::text[] end
    || case when p_permissions->'academy_track_service' = 'true'::jsonb then
      array['service.case_1_machine_history']::text[] else '{}'::text[] end
    else '{}'::text[] end;
$$;
revoke all on function public.academy_assigned_case_ids(text[], jsonb) from public, anon;
grant execute on function public.academy_assigned_case_ids(text[], jsonb) to authenticated, service_role;
