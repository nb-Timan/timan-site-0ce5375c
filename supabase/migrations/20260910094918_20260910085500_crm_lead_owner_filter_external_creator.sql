do $$
begin
  if pg_get_functiondef(
    'public.crm_leads_page_query(boolean,uuid,text,uuid[],uuid[],text[],text,text,text,text,text,text,text,text,integer,integer,timestamptz,text,uuid[])'::regprocedure
  ) not like '%public.app_users owner_directory%'
  or pg_get_functiondef(
    'public.crm_leads_page_query(boolean,uuid,text,uuid[],uuid[],text[],text,text,text,text,text,text,text,text,integer,integer,timestamptz,text,uuid[])'::regprocedure
  ) not like '%public.app_users creator_directory%'
  or pg_get_functiondef(
    'public.crm_leads_page_query(boolean,uuid,text,uuid[],uuid[],text[],text,text,text,text,text,text,text,text,integer,integer,timestamptz,text,uuid[])'::regprocedure
  ) not like '%creator_directory.portal_role::text in%' then
    raise exception 'external creator classification is missing';
  end if;
end;
$$;;
