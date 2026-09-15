-- CRM's responsible-seller selector accepts both Timan sellers and Backend
-- users. Keep the overview's owner label on that same canonical rule.
do $migration$
declare
  v_signature constant text := 'public.crm_leads_page_query(boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz, text, uuid[])';
  v_definition text;
  v_old_owner_classification constant text := 'coalesce(owner_directory.portal_role = ''timan_seller'', false) as owner_is_timan_seller';
  v_new_owner_classification constant text := 'coalesce(owner_directory.portal_role::text in (''timan_seller'', ''timan_backend''), false) as owner_is_timan_seller';
begin
  select pg_get_functiondef(v_signature::regprocedure)
    into v_definition;

  if position(v_old_owner_classification in v_definition) = 0 then
    raise exception 'crm_leads_page_query does not match the verified owner classification';
  end if;

  execute replace(v_definition, v_old_owner_classification, v_new_owner_classification);
end;
$migration$;
