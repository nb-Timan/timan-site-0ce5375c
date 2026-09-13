do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_leads' and column_name = 'created_by_user_id'
  ) then
    raise exception 'created_by_user_id is missing';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.crm_leads'::regclass
      and tgname = 'stamp_crm_lead_creator_before_write'
      and not tgisinternal
  ) then
    raise exception 'stamp_crm_lead_creator_before_write is missing';
  end if;
  if pg_get_functiondef(
    'public.crm_leads_page_query(boolean,uuid,text,uuid[],uuid[],text[],text,text,text,text,text,text,text,text,integer,integer,timestamptz,text,uuid[])'::regprocedure
  ) not like '%created_by_partner%' then
    raise exception 'owner-filter RPC creator classification is missing';
  end if;
end;
$$;;
