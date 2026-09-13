do $$
begin
  if pg_get_functiondef('public.stamp_crm_lead_creator()'::regprocedure)
    not like '%if session_creator_id is not null then new.created_by_user_id := session_creator_id%' then
    raise exception 'creator trigger fallback is missing';
  end if;
end;
$$;;
